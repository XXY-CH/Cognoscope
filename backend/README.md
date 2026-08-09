# Congnoscope Backend

基于 Beat 的后端 API，移除了 authority/auth 体系，简化为单用户模式。

## 主要改动

- 移除：accounts、sessions、external_authorizations
- 简化：所有 `owner_account_id` 固定为 `'default-user'`
- 数据库：SQLite（替代 PostgreSQL）
- 认证：移除所有认证装饰器

## 运行

```bash
cd backend
python -m uvicorn cognoscope.api.main:app --reload
```