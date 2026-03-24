# Smart Reader Backend

这是一个智能阅读器应用的后端服务，基于FastAPI构建，支持用户认证、图书管理和文件上传等功能。

## 项目特性

- 基于FastAPI的高性能Web框架
- 支持用户注册和认证
- 图书管理功能
- 文件上传和存储
- 数据库支持（SQLite）

## 环境要求

- Python 3.8+
- pip包管理器
- virtualenv（推荐）

## 安装步骤

1. 克隆项目并进入backend目录：
   ```bash
   cd d:\work_space\smart-reader\backend
   ```

2. 创建并激活虚拟环境：
   ```bash
   python -m venv fresh_env
   .\fresh_env\Scripts\activate  # Windows
   # 或
   source fresh_env/bin/activate  # Linux/Mac
   ```

3. 安装依赖：
   ```bash
   pip install -r requirements.txt
   # 如果没有requirements.txt文件，则安装必要的包：
   pip install fastapi uvicorn sqlalchemy async-exit-stack async-generator python-multipart python-jose[cryptography] passlib[bcrypt] alembic aiosqlite
   ```

## 数据库配置与迁移

本项目使用Alembic进行数据库迁移管理。

### 初始设置

1. 确保环境变量配置正确，在`.env.dev`文件中设置：
   ```
   DATABASE_URL=sqlite+aiosqlite:///./smart_reader.db
   ```

2. 在项目根目录下运行数据库迁移：
   ```bash
   cd d:\work_space\smart-reader\backend
   .\fresh_env\Scripts\activate
   alembic revision --autogenerate -m "Initial migration"
   alembic upgrade head
   ```

### 后续迁移

当修改数据模型后，需要生成新的迁移文件：
```bash
alembic revision --autogenerate -m "描述你的更改"
alembic upgrade head
```

## 启动应用

1. 确保数据库已正确迁移
2. 启动FastAPI服务器：
   ```bash
   uvicorn app.main:app --reload
   ```

3. 访问 http://localhost:8000 查看应用
4. 访问 http://localhost:8000/docs 查看API文档

## 环境变量配置

项目支持多种环境配置，可在以下文件中设置：

- `.env.dev` - 开发环境
- `.env.stage` - 预发布环境
- `.env.prod` - 生产环境

主要配置项：
- `ENVIRONMENT` - 设置当前环境
- `DATABASE_URL` - 数据库连接地址
- `SECRET_KEY` - JWT密钥
- `ALGORITHM` - JWT算法
- `ACCESS_TOKEN_EXPIRE_MINUTES` - 访问令牌过期时间

## 数据模型

项目包含以下主要数据模型：

- **User**: 用户信息（用户名、邮箱、密码等）
- **FileMetadata**: 文件元数据（文件名、类型、大小等）
- **Book**: 图书信息（标题、所有者、阅读进度等）

## API路由

- `/auth/` - 认证相关接口
- `/books/` - 图书管理接口
- `/files/` - 文件管理接口
- `/upload/` - 文件上传接口
- `/health` - 健康检查接口

## 错误排查

如果遇到 "no such table: users" 错误，请确保已完成数据库迁移步骤。

如果遇到 "asyncio extension requires an async driver" 错误，请检查数据库URL格式是否正确，对于SQLite应使用 `sqlite+aiosqlite://` 格式。

## 许可证

[在此处添加许可证信息]