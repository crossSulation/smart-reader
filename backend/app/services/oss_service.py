import os
from abc import ABC, abstractmethod
from typing import Optional
import boto3
from botocore.exceptions import ClientError
import logging

logger = logging.getLogger(__name__)

class OSSProvider(ABC):
    """OSS提供商抽象基类"""
    
    @abstractmethod
    def upload_file(self, local_file_path: str, object_name: str) -> str:
        """上传文件到OSS，返回访问URL"""
        pass
    
    @abstractmethod
    def download_file(self, object_name: str, local_file_path: str) -> bool:
        """从OSS下载文件到本地"""
        pass
    
    @abstractmethod
    def delete_file(self, object_name: str) -> bool:
        """删除OSS上的文件"""
        pass
    
    @abstractmethod
    def get_file_url(self, object_name: str, expiration: int = 3600) -> str:
        """获取临时访问URL"""
        pass


class AWSS3OSS(OSSProvider):
    """AWS S3 OSS实现"""
    
    def __init__(self, access_key: str, secret_key: str, region: str, bucket_name: str):
        self.bucket_name = bucket_name
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
    
    def upload_file(self, local_file_path: str, object_name: str) -> str:
        """上传文件到S3"""
        try:
            self.s3_client.upload_file(local_file_path, self.bucket_name, object_name)
            return f"https://{self.bucket_name}.s3.{self.s3_client.meta.region_name}.amazonaws.com/{object_name}"
        except ClientError as e:
            logger.error(f"Error uploading to S3: {e}")
            raise e
    
    def download_file(self, object_name: str, local_file_path: str) -> bool:
        """从S3下载文件"""
        try:
            self.s3_client.download_file(self.bucket_name, object_name, local_file_path)
            return True
        except ClientError as e:
            logger.error(f"Error downloading from S3: {e}")
            return False
    
    def delete_file(self, object_name: str) -> bool:
        """删除S3上的文件"""
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=object_name)
            return True
        except ClientError as e:
            logger.error(f"Error deleting from S3: {e}")
            return False
    
    def get_file_url(self, object_name: str, expiration: int = 3600) -> str:
        """生成临时访问URL"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise e


class AliyunOSS(OSSProvider):
    """阿里云OSS实现"""
    
    def __init__(self, access_key: str, secret_key: str, endpoint: str, bucket_name: str):
        try:
            import oss2
            self.auth = oss2.Auth(access_key, secret_key)
            self.bucket = oss2.Bucket(self.auth, endpoint, bucket_name)
        except ImportError:
            raise ImportError("请安装oss2: pip install oss2")
    
    def upload_file(self, local_file_path: str, object_name: str) -> str:
        """上传文件到阿里云OSS"""
        try:
            self.bucket.put_object_from_file(object_name, local_file_path)
            # 返回公共读取URL（如果bucket是公共读取的）
            # 或者使用签名URL
            return self.get_file_url(object_name)
        except Exception as e:
            logger.error(f"Error uploading to Aliyun OSS: {e}")
            raise e
    
    def download_file(self, object_name: str, local_file_path: str) -> bool:
        """从阿里云OSS下载文件"""
        try:
            self.bucket.get_object_to_file(object_name, local_file_path)
            return True
        except Exception as e:
            logger.error(f"Error downloading from Aliyun OSS: {e}")
            return False
    
    def delete_file(self, object_name: str) -> bool:
        """删除阿里云OSS上的文件"""
        try:
            self.bucket.delete_object(object_name)
            return True
        except Exception as e:
            logger.error(f"Error deleting from Aliyun OSS: {e}")
            return False
    
    def get_file_url(self, object_name: str, expiration: int = 3600) -> str:
        """生成签名URL"""
        try:
            # 设置过期时间为当前时间+expiration秒
            import time
            expiration_time = int(time.time()) + expiration
            url = self.bucket.sign_url('GET', object_name, expiration)
            return url
        except Exception as e:
            logger.error(f"Error generating signed URL: {e}")
            raise e


class OSSManager:
    """OSS管理器，根据配置选择合适的OSS提供商"""
    
    def __init__(self):
        # 从环境变量获取配置
        provider = os.getenv("OSS_PROVIDER", "local").lower()
        
        if provider == "aws_s3":
            access_key = os.getenv("AWS_ACCESS_KEY_ID")
            secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
            region = os.getenv("AWS_REGION", "us-east-1")
            bucket_name = os.getenv("AWS_S3_BUCKET_NAME")
            
            if not all([access_key, secret_key, bucket_name]):
                raise ValueError("缺少AWS S3配置信息")
            
            self.provider = AWSS3OSS(access_key, secret_key, region, bucket_name)
        
        elif provider == "aliyun":
            access_key = os.getenv("ALIYUN_ACCESS_KEY_ID")
            secret_key = os.getenv("ALIYUN_SECRET_ACCESS_KEY")
            endpoint = os.getenv("ALIYUN_OSS_ENDPOINT")
            bucket_name = os.getenv("ALIYUN_OSS_BUCKET_NAME")
            
            if not all([access_key, secret_key, endpoint, bucket_name]):
                raise ValueError("缺少阿里云OSS配置信息")
            
            self.provider = AliyunOSS(access_key, secret_key, endpoint, bucket_name)
        
        elif provider == "local":
            # 本地存储，用于开发测试
            self.provider = LocalOSS()
        else:
            raise ValueError(f"不支持的OSS提供商: {provider}")
    
    def upload_file(self, local_file_path: str, object_name: str) -> str:
        return self.provider.upload_file(local_file_path, object_name)
    
    def download_file(self, object_name: str, local_file_path: str) -> bool:
        return self.provider.download_file(object_name, local_file_path)
    
    def delete_file(self, object_name: str) -> bool:
        return self.provider.delete_file(object_name)
    
    def get_file_url(self, object_name: str, expiration: int = 3600) -> str:
        return self.provider.get_file_url(object_name, expiration)


class LocalOSS(OSSProvider):
    """本地存储模拟OSS行为，仅用于开发测试"""
    
    def upload_file(self, local_file_path: str, object_name: str) -> str:
        """实际上只是移动文件到目标位置"""
        import shutil
        target_path = os.path.join("uploads", object_name)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        shutil.move(local_file_path, target_path)
        return f"/api/files/download/{object_name}"
    
    def download_file(self, object_name: str, local_file_path: str) -> bool:
        target_path = os.path.join("uploads", object_name)
        import shutil
        shutil.copy2(target_path, local_file_path)
        return True
    
    def delete_file(self, object_name: str) -> bool:
        target_path = os.path.join("uploads", object_name)
        if os.path.exists(target_path):
            os.remove(target_path)
            return True
        return False
    
    def get_file_url(self, object_name: str, expiration: int = 3600) -> str:
        return f"/api/files/download/{object_name}"