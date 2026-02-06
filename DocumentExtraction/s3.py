from typing import Dict, Any, List, Optional
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import os
import io
import datetime
import logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s')
handler.setFormatter(formatter)
if not logger.hasHandlers():
    logger.addHandler(handler)

from dotenv import load_dotenv
load_dotenv()
class S3ClientWrapper:
    def __init__(self, endpoint: str = None, access_key: str = None, secret_key: str = None, secure: bool = True, region_name: str = "us-east-1"):
        self.endpoint = endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.secure = secure
        self.region_name = region_name
        self.default_folders = [os.getenv("S3_BUCKET")]
        
        # Determine if we are connecting to AWS S3 or a custom MinIO/S3-compatible server
        endpoint_url = None
        if endpoint:
            # Simple heuristic: if "amazonaws.com" is not in endpoint, treat as custom endpoint
            # Also check if it's not empty
            if "amazonaws.com" not in endpoint and endpoint.strip():
                protocol = "https" if secure else "http"
                # Handle case where endpoint might already have protocol
                if not endpoint.startswith("http"):
                    endpoint_url = f"{protocol}://{endpoint}"
                else:
                    endpoint_url = endpoint
        
        self.client = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region_name,
            endpoint_url=endpoint_url,
            use_ssl=secure
        )
        
        self._health_check()
        self._ensure_buckets()

    def _health_check(self) -> Dict[str, Any]:
        """
        Check S3 service health.
        """
        try:
            response = self.client.list_buckets()
            buckets = [b['Name'] for b in response.get('Buckets', [])]
            logger.info("S3 health check successful. Buckets: %s", buckets)
            return {"status": "ok", "buckets": buckets}
        except Exception as e:
            logger.error("S3 health check failed: %s", e)
            return {"status": "error", "error": str(e)}

    def _ensure_buckets(self) -> None:
        """Check if bucket exists and create it if needed."""
        bucket_name = self.default_folders[0]
        if bucket_name:
            self.create_bucket(bucket_name)

    def create_bucket(self, bucket_name: str) -> bool:
        """
        Create a new bucket in S3 if it does not exist.
        """
        try:
            self.client.head_bucket(Bucket=bucket_name)
            logger.info("Bucket %s exists", bucket_name)
            return False
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                try:
                    # 1. Tạo Bucket
                    if self.client.meta.region_name == 'us-east-1':
                        self.client.create_bucket(Bucket=bucket_name)
                    else:
                        self.client.create_bucket(
                            Bucket=bucket_name,
                            CreateBucketConfiguration={'LocationConstraint': self.client.meta.region_name}
                        )
                    logger.info("Created bucket %s", bucket_name)

                    # 2. Cấu hình để cho phép Public Access (để hàm upload_file_public chạy được)
                    # Tắt Block Public Access
                    self.client.delete_public_access_block(Bucket=bucket_name)
                    
                    # Bật ACLs (Object Ownership: Bucket Owner Preferred)
                    self.client.put_bucket_ownership_controls(
                        Bucket=bucket_name,
                        OwnershipControls={
                            'Rules': [{'ObjectOwnership': 'BucketOwnerPreferred'}]
                        }
                    )
                    logger.info("Enabled Public Access & ACLs for bucket %s", bucket_name)

                    # 3. Bật Versioning (Tùy chọn - Nếu bạn muốn lưu lịch sử file)
                    self.client.put_bucket_versioning(
                        Bucket=bucket_name,
                        VersioningConfiguration={'Status': 'Suspended'}
                    )
                    logger.info("Enabled Versioning for bucket %s", bucket_name)

                    return True
                except Exception as create_error:
                    logger.error("Failed to configure bucket %s: %s", bucket_name, create_error)
                    return False
            elif error_code == '403':
                logger.warning("Bucket %s exists but access is forbidden (403). You likely do not own this bucket.", bucket_name)
                return False
            else:
                logger.error("Error checking bucket %s: %s", bucket_name, e)
                return False

    def upload_file(self, file_path: str, bucket_type: str,
                    folder_name: str, file_name: str) -> str:
        """
        Upload file to S3 bucket.
        """
        object_name = f"{folder_name}/{file_name}"
        try:
            self.client.upload_file(file_path, bucket_type, object_name)
            logger.info("Uploaded %s to bucket %s", object_name, bucket_type)
            return f"Uploaded {object_name} to {bucket_type}"
        except Exception as e:
            logger.error("Upload failed for %s to bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Upload failed: {e}")

    def download_file(self, bucket_type: str, object_name: str, file_path: str) -> bool:
        """
        Download file from S3 to local path.
        """
        try:
            self.client.download_file(bucket_type, object_name, file_path)
            logger.info("Downloaded %s from bucket %s to %s", object_name, bucket_type, file_path)
            return True
        except Exception as e:
            logger.error("Download failed for %s from bucket %s: %s", object_name, bucket_type, e)
            return False

    def get_presigned_url(self, bucket_type: str, object_name: str, expires_seconds: int = 3600) -> str:
        """
        Generate presigned URL for file access.
        """
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket_type, 'Key': object_name},
                ExpiresIn=expires_seconds
            )
            logger.info("Generated presigned URL for %s in bucket %s", object_name, bucket_type)
            return url
        except Exception as e:
            logger.error("Failed to generate presigned URL for %s in bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Failed to generate presigned URL: {e}")
    def get_object(self, bucket_type: str, object_name: str):
        """
        Return the streaming body for an object (boto3's StreamingBody).
        Caller can call .read(), .close() on the returned object.
        """
        try:
            resp = self.client.get_object(Bucket=bucket_type, Key=object_name)
            body = resp.get("Body")
            if body is None:
                logger.error("get_object: response for %s/%s has no Body", bucket_type, object_name)
                raise RuntimeError("No body in get_object response")
            logger.info("Fetched object %s from bucket %s", object_name, bucket_type)
            return body
        except Exception as e:
            logger.error("Failed to get object %s from bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Failed to get object: {e}")
    def list_objects(self, bucket_type: str, prefix: str = "") -> List[Dict[str, Any]]:
        """
        List objects in bucket with optional prefix.
        """
        objects_info = []
        try:
            paginator = self.client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket_type, Prefix=prefix)
            
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        # print("Object name:", obj['Key'])
                        objects_info.append({
                            "object_name": obj['Key'],
                            "size": obj['Size'],
                            "last_modified": obj['LastModified']
                        })
            logger.info("Listed %d objects in bucket %s with prefix '%s'", len(objects_info), bucket_type, prefix)
        except Exception as e:
            logger.error("Failed to list objects in bucket %s: %s", bucket_type, e)
        return objects_info

    def delete_object(self, bucket_type: str, object_name: str) -> bool:
        """
        Delete object from bucket.
        """
        try:
            self.client.delete_object(Bucket=bucket_type, Key=object_name)
            logger.info("Deleted object %s from bucket %s", object_name, bucket_type)
            return True
        except Exception as e:
            logger.error("Failed to delete object %s from bucket %s: %s", object_name, bucket_type, e)
            return False

    def delete_objects(self, bucket_type: str, object_names: List[str]) -> List[str]:
        """
        Delete multiple objects from bucket.
        """
        deleted = []
        if not object_names:
            return deleted
            
        try:
            # S3 delete_objects can take up to 1000 keys
            objects = [{'Key': name} for name in object_names]
            response = self.client.delete_objects(
                Bucket=bucket_type,
                Delete={'Objects': objects}
            )
            if 'Deleted' in response:
                for d in response['Deleted']:
                    deleted.append(d['Key'])
                logger.info("Deleted objects %s from bucket %s", deleted, bucket_type)
            if 'Errors' in response:
                for e in response['Errors']:
                    logger.error("Error deleting %s: %s", e['Key'], e['Message'])
        except Exception as e:
            logger.error("Failed to delete objects from bucket %s: %s", bucket_type, e)
        return deleted

    def get_bucket_info(self, bucket_type: str) -> Dict[str, Any]:
        """
        Get information about a specific bucket.
        """
        try:
            response = self.client.list_buckets()
            for b in response.get('Buckets', []):
                if b['Name'] == bucket_type:
                    logger.info("Found info for bucket %s", bucket_type)
                    return {
                        "name": b['Name'],
                        "creation_date": b['CreationDate']
                    }
            logger.warning("Bucket %s not found", bucket_type)
            return {"error": "Bucket not found"}
        except Exception as e:
            logger.error("Failed to get bucket info for %s: %s", bucket_type, e)
            return {"error": str(e)}

    def get_download_link(self, bucket_type: str, object_name: str, filename: str = None) -> str:
        """
        Get permanent public link that forces browser to download the object.
        """
        try:
            download_name = filename or os.path.basename(object_name)
            url = self.client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': bucket_type, 
                    'Key': object_name,
                    'ResponseContentDisposition': f'attachment; filename={download_name}'
                },
                ExpiresIn=3600 * 24 * 7 
            )
            logger.info("Generated download link for %s in bucket %s: %s", object_name, bucket_type, url)
            return url
        except Exception as e:
            logger.error("Failed to generate permanent link for %s in bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Failed to generate permanent link: {e}")

    def delete_folder(self, bucket_type: str, folder: str) -> List[str]:
        """
        Delete all objects under a folder/prefix.
        """
        try:
            prefix = folder.strip("/")
            if not prefix:
                return []
            
            objects_to_delete = []
            paginator = self.client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket_type, Prefix=prefix)
            
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        objects_to_delete.append(obj['Key'])
            
            if not objects_to_delete:
                return []
                
            return self.delete_objects(bucket_type, objects_to_delete)

        except Exception as e:
            logger.error("Failed to delete folder %s in bucket %s: %s", folder, bucket_type, e)
            return []
    def upload_fileobj(self, fileobj, bucket_type: str,
                            folder_name: str, file_name: str,
                            content_type: str = "application/octet-stream") -> str:
        """
        Upload file-like object to bucket.
        """
        object_name = f"{folder_name}/{file_name}"
        try:
            fileobj.seek(0)
            self.client.put_object(
                Bucket=bucket_type,
                Key=object_name,
                Body=fileobj,
                ContentType=content_type
            )
            logger.info("Uploaded %s to bucket %s (public)", object_name, bucket_type)
            scheme = "https" if self.secure else "http"
            url = f"{scheme}://{self.endpoint}/{bucket_type}/{object_name}"
            logger.info("URL: %s", url)
            return url
        except Exception as e:
            logger.error("Upload failed for %s to bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Upload failed: {e}")
        
if __name__ == "__main__":
    minio = S3ClientWrapper(
        endpoint="s3.amazonaws.com",
        access_key=os.getenv("AWS_ACCESS_KEY_ID"),
        secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        secure=True,
        region_name="ap-southeast-2"
    )
    # minio.upload_file(file_path=r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\output\103071_Winter_Tech_Anorak_Fit_Cmmts_HO26_bn\images\picture-3.png",
    #                   bucket_type="quannm-bucket-tool-use",
    #                   folder_name=r"103071_Winter_Tech_Anorak_Fit_Cmmts_HO26_bn/images",
    #                   file_name="picture-3.png")
    print(minio.delete_folder(bucket_type="quannm-bucket-tool-use",
                        folder="tool_use_agent/scribe_test"))
#     print(minio.get_presigned_url(
#     bucket_type="quannm-bucket-tool-use",
#     object_name="103071_Winter_Tech_Anorak_Fit_Cmmts_HO26_bn/images/picture-3.png",
#     expires_seconds=3600
# ))