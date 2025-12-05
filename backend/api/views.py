from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from .models import UploadedFile

class FileUploadView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES['file']
        uploaded_file = UploadedFile.objects.create(
            file=file_obj,
            original_name=file_obj.name
        )
        return Response({
            'file_url': uploaded_file.file.url,
            'original_name': uploaded_file.original_name
        }, status=status.HTTP_201_CREATED)
