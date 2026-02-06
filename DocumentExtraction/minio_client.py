from typing import Dict, Any, List
from minio import Minio
from minio.error import S3Error
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
class MinioClientWrapper:
    def __init__(self, endpoint: str, access_key: str, secret_key: str, secure: bool = False):
        self.endpoint = endpoint
        self.client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )
        self.secure = secure
        self.default_folders = [os.getenv("STORAGE_BUCKET")]
        self._health_check()
        self._ensure_buckets()


    def _health_check(self) -> Dict[str, Any]:
        """
        Check MinIO service health.
        """
        try:
            buckets = self.client.list_buckets()
            logger.info("MinIO health check successful. Buckets: %s", [b.name for b in buckets])
            return {"status": "ok", "buckets": [b.name for b in buckets]}
        except Exception as e:
            logger.error("MinIO health check failed: %s", e)
            return {"status": "error", "error": str(e)}

    def _ensure_buckets(self) -> None:
        """Check if bucket exists and create document-output folder if needed."""
        bucket_name = self.default_folders[0]
        try:
            if not self.client.bucket_exists(bucket_name):
                created = self.create_bucket(bucket_name)
                if created:
                    logger.info("Bucket %s did not exist. Created new bucket.", bucket_name)
                else:
                    logger.warning("Bucket %s did not exist and could not be created.", bucket_name)
            else:
                logger.info("Bucket %s exists", bucket_name)
        except S3Error as e:
            logger.error("Error checking bucket %s: %s", bucket_name, e)

    def create_bucket(self, bucket_name: str) -> bool:
        """
        Create a new bucket in MinIO if it does not exist.
        """
        try:
            if not self.client.bucket_exists(bucket_name):
                self.client.make_bucket(bucket_name)
                logger.info("Created bucket %s", bucket_name)
                return True
            else:
                logger.info("Bucket %s already exists", bucket_name)
                return False
        except Exception as e:
            logger.error("Failed to create bucket %s: %s", bucket_name, e)
            return False

# ...existing code...
    def upload_file_private(self, file_path: str, bucket_type: str,
                    folder_name: str, file_name: str) -> str:
        """
        Upload file to MinIO bucket.
        """
        object_name = f"{folder_name}/{file_name}"
        try:
            self.client.fput_object(bucket_type, object_name, file_path)
            logger.info("Uploaded %s to bucket %s", object_name, bucket_type)
            return f"Uploaded {object_name} to {bucket_type}"
        except Exception as e:
            logger.error("Upload failed for %s to bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Upload failed: {e}")

    def download_file(self, bucket_type: str, object_name: str, file_path: str) -> bool:
        """
        Download file from MinIO to local path.
        """
        try:
            self.client.fget_object(bucket_type, object_name, file_path)
            logger.info("Downloaded %s from bucket %s to %s", object_name, bucket_type, file_path)
            return True
        except S3Error as e:
            logger.error("Download failed for %s from bucket %s: %s", object_name, bucket_type, e)
            return False
        
    def get_object(self, bucket_type: str, object_name: str):
        """
        Return the streaming body for an object (boto3's StreamingBody).
        Caller can call .read(), .close() on the returned object.
        """
        try:
            # MinioClient.get_object returns a response-like stream object
            resp = self.client.get_object(bucket_type, object_name)
            logger.info("Fetched object %s from bucket %s", object_name, bucket_type)
            return resp
        except Exception as e:
            logger.error("Failed to get object %s from bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Failed to get object: {e}")
    def get_presigned_url(self, bucket_type: str, object_name: str, expires_seconds: int = 3600) -> str:
        """
        Generate presigned URL for file access.
        """
        try:
            url = self.client.presigned_get_object(bucket_type, object_name,
                                                   expires=datetime.timedelta(seconds=expires_seconds))
            logger.info("Generated presigned URL for %s in bucket %s", object_name, bucket_type)
            return url
        except Exception as e:
            logger.error("Failed to generate presigned URL for %s in bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Failed to generate presigned URL: {e}")

    def list_objects(self, bucket_type: str, prefix: str = "") -> List[Dict[str, Any]]:
        """
        List objects in bucket with optional prefix.
        """
        objects_info = []
        try:
            for obj in self.client.list_objects(bucket_type, prefix=prefix, recursive=True):
                # print("Object name:", obj.object_name)  # Print object name
                objects_info.append({
                    "object_name": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified
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
            self.client.remove_object(bucket_type, object_name)
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
        try:
            errors = self.client.remove_objects(bucket_type, object_names)
            for error in errors:
                logger.error("Error deleting %s: %s", error.object_name, error)
            else:
                deleted.extend(object_names)
                logger.info("Deleted objects %s from bucket %s", object_names, bucket_type)
        except Exception as e:
            logger.error("Failed to delete objects from bucket %s: %s", bucket_type, e)
        return deleted

    def get_bucket_info(self, bucket_type: str) -> Dict[str, Any]:
        """
        Get information about a specific bucket.
        """
        try:
            buckets = self.client.list_buckets()
            for b in buckets:
                if b.name == bucket_type:
                    logger.info("Found info for bucket %s", bucket_type)
                    return {
                        "name": b.name,
                        "creation_date": b.creation_date
                    }
            logger.warning("Bucket %s not found", bucket_type)
            return {"error": "Bucket not found"}
        except Exception as e:
            logger.error("Failed to get bucket info for %s: %s", bucket_type, e)
            return {"error": str(e)}

    def upload_file(self, file_path: str, bucket_type: str,
                    folder_name: str, file_name: str) -> str:
        """
        Upload file to MinIO bucket and make it public.

        Returns:
            str: Public URL to access the object
        """
        object_name = f"{folder_name}/{file_name}"

        try:
            self.client.fput_object(bucket_type, object_name, file_path)
            logger.info("Uploaded %s to bucket %s (public)", object_name, bucket_type)
            # muốn private thì comment phần này lại
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{bucket_type}/*"]
                    }
                ]
            }

            import json
            self.client.set_bucket_policy(bucket_type, json.dumps(policy))
            logger.info("Set public-read policy for bucket %s", bucket_type)
            ### 
            scheme = "https" if self.secure else "http"
            url = f"{scheme}://{self.endpoint}/{bucket_type}/{object_name}"
            logger.info("Public URL: %s", url)
            return url

        except Exception as e:
            logger.error("Public upload failed for %s to bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Public upload failed: {e}")

    def get_download_link(self, bucket_type: str, object_name: str, filename: str = None) -> str:
        """
        Get permanent public link that forces browser to download the object.
        Note: Bucket must have public-read policy.

        Args:
            bucket_type (str): Bucket name
            object_name (str): Object key in bucket
            filename (str): Optional filename for downloaded file

        Returns:
            str: Permanent public download URL
        """
        try:
            scheme = "https" if self.client._secure else "http"
            download_name = filename or os.path.basename(object_name)
            url = (
                f"{scheme}://{self.client._endpoint}/{bucket_type}/{object_name}"
                f"?response-content-disposition=attachment;filename={download_name}"
            )
            logger.info("Generated download link for %s in bucket %s: %s", object_name, bucket_type, url)
            return url
        except Exception as e:
            logger.error("Failed to generate permanent link for %s in bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Failed to generate permanent link: {e}")
    def upload_fileobj(self, fileobj, bucket_type: str,
                            folder_name: str, file_name: str,
                            content_type: str = "application/octet-stream") -> str:
        """
        Upload file-like object to MinIO bucket and make it public.
        """
        object_name = f"{folder_name}/{file_name}"
        try:
            fileobj.seek(0)
            self.client.put_object(
                bucket_type,
                object_name,
                fileobj,
                length=-1,  # unknown length, MinIO will use chunked encoding
                part_size=10*1024*1024,  # 10MB
                content_type=content_type
            )
            logger.info("Uploaded %s to bucket %s", object_name, bucket_type)

            # muốn private thì comment phần này lại
            try:
                policy = {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {"AWS": ["*"]},
                            "Action": ["s3:GetObject"],
                            "Resource": [f"arn:aws:s3:::{bucket_type}/*"]
                        }
                    ]
                }
                import json
                self.client.set_bucket_policy(bucket_type, json.dumps(policy))
                logger.info("Set public-read policy for bucket %s", bucket_type)
            except Exception as e:
                logger.warning("Failed to set public policy for bucket %s: %s", bucket_type, e)
            ###
            scheme = "https" if self.secure else "http"
            url = f"{scheme}://{self.endpoint}/{bucket_type}/{object_name}"
            logger.info("URL: %s", url)
            return url
        
        except Exception as e:
            logger.error("Upload failed for %s to bucket %s: %s", object_name, bucket_type, e)
            raise RuntimeError(f"Upload failed: {e}")
    def push_image(self, dir):
        for file_name in os.listdir(dir):
            if file_name.endswith(".png"):
                file_path = os.path.join(dir, file_name)

                # Tìm phần đường dẫn sau thư mục "output" để tạo object key giống yêu cầu
                try:
                    # chuẩn hoá đường dẫn
                    full_path = os.path.normpath(file_path)
                    low_path = full_path.lower()
                    marker = os.sep + "output" + os.sep
                    if marker in low_path:
                        # lấy phần sau "output/"
                        rel_part = full_path.split(marker, 1)[1]
                    else:
                        # nếu không tìm thấy "output", dùng đường dẫn relative so với dir
                        rel_part = os.path.relpath(full_path, start=dir)

                    # tách thành thư mục và tên file, chuyển separator sang '/'
                    rel_dir = os.path.dirname(rel_part).replace(os.sep, "/").strip("/")
                    base_minio_folder = os.getenv("MINIO_FOLDER", "").strip("/")
                    
                    # folder_name truyền vào API (MINIO_FOLDER + / + rel_dir) hoặc chỉ MINIO_FOLDER nếu rel_dir rỗng
                    if rel_dir:
                        folder_name = f"{base_minio_folder}/{rel_dir}" if base_minio_folder else rel_dir
                    else:
                        folder_name = base_minio_folder or ""

                    # gọi upload (sử dụng self)
                    self.upload_file_public(
                        file_path=file_path,
                        bucket_type=os.getenv("MINIO_BUCKET"),
                        folder_name=folder_name,
                        file_name=file_name
                    )
                    logger.info("Uploaded %s as %s/%s", file_path, folder_name, file_name)
                except Exception as e:
                    logger.error("Failed to upload %s: %s", file_path, e)
    def delete_folder(self, bucket_type: str, folder: str) -> List[str]:
        """
        Delete all objects under a folder/prefix by removing each object individually.
        This avoids remove_objects serialization issues in some MinIO client versions.

        Args:
            bucket_type: target bucket name
            folder: folder/prefix to delete (e.g. "scribetest" or "scribetest/images")

        Returns:
            List of deleted object keys.
        """
        try:
            base_minio_folder = os.getenv("MINIO_FOLDER", "").strip("/")
            pref = (folder or "").strip("/")

            # Build full prefix
            if base_minio_folder:
                if pref and not pref.startswith(base_minio_folder):
                    full_prefix = f"{base_minio_folder}/{pref}"
                elif not pref:
                    full_prefix = base_minio_folder
                else:
                    full_prefix = pref
            else:
                full_prefix = pref

            full_prefix = full_prefix.strip("/")
            if not full_prefix:
                logger.warning("Refusing to delete with empty prefix/root for bucket %s", bucket_type)
                return []

            objects = list(self.client.list_objects(bucket_type, prefix=full_prefix, recursive=True))
            if not objects:
                logger.info("No objects found with prefix '%s' in bucket %s", full_prefix, bucket_type)
                return []

            deleted = []
            for obj in objects:
                try:
                    self.client.remove_object(bucket_type, obj.object_name)
                    deleted.append(obj.object_name)
                except Exception as e:
                    logger.error("Failed to delete %s from bucket %s: %s", obj.object_name, bucket_type, e)

            logger.info("Deleted %d objects under prefix '%s' in bucket %s", len(deleted), full_prefix, bucket_type)
            return deleted

        except Exception as e:
            logger.error("Failed to delete folder %s in bucket %s: %s", folder, bucket_type, e)
            return []

if __name__ == "__main__":
    minio = MinioClientWrapper(
        endpoint="localhost:9000",
        access_key="minioadmin",
        secret_key="minioadmin",
        secure=False,
    )
    forms_dir = r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\output\scribetest\images"
    # minio.push_image(forms_dir)
    # minio.list_objects(bucket_type=bucket_name, prefix="project_3")
    # minio.delete_folder(bucket_type="test-bucket", folder="scribetest")
    print(minio.get_presigned_url(bucket_type=os.getenv("STORAGE_BUCKET"), object_name="document/manualVN_1/images/picture-2.png"))