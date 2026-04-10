# SQLite 使用指南 - Agent Firewall

## 什么是 SQLite？

SQLite 是一个**嵌入式数据库**，与传统数据库（如 MySQL、PostgreSQL）的主要区别：

| 特性     | SQLite        | MySQL/PostgreSQL |
| -------- | ------------- | ---------------- |
| 架构     | 嵌入式库      | 客户端-服务器    |
| 启动     | 无需启动      | 需要启动服务     |
| 配置     | 零配置        | 需要配置         |
| 文件     | 单个 .db 文件 | 多个数据文件     |
| 适用场景 | 轻量级应用    | 大型多用户系统   |

## Agent Firewall 中的 SQLite

### 1. 配置 SQLite 存储

编辑 `.env` 文件：

```bash
# 选择存储后端（jsonl 或 sqlite）
AF_STORAGE_BACKEND=sqlite

# SQLite 数据库文件路径
AF_STORAGE_PATH=./data/firewall.db
```

### 2. 自动初始化

当你启动 Agent Firewall 后端时，如果选择了 SQLite：

1. 系统会自动检查数据库文件是否存在
2. 如果不存在，会自动创建数据库文件和表结构
3. 无需手动执行任何 SQL 脚本

### 3. 数据库表结构

Agent Firewall 的 SQLite 数据库包含以下表：

```sql
-- 轨迹表
CREATE TABLE traces (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    timestamp REAL,
    method TEXT,
    verdict TEXT,
    threat_level TEXT,
    messages TEXT,  -- JSON
    analysis TEXT,  -- JSON
    metadata TEXT   -- JSON
);

-- 数据集表
CREATE TABLE datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_public INTEGER DEFAULT 0,
    created_at REAL,
    updated_at REAL,
    metadata TEXT  -- JSON
);

-- 注释表
CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    trace_id TEXT,
    address TEXT,
    content TEXT,
    severity TEXT,
    source TEXT,
    created_at REAL,
    FOREIGN KEY (trace_id) REFERENCES traces(id)
);

-- 策略表
CREATE TABLE policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    enabled INTEGER DEFAULT 1,
    created_at REAL,
    updated_at REAL
);
```

## 使用 SQLite 命令行工具

### 安装检查

macOS 和大多数 Linux 系统已预装 `sqlite3`：

```bash
which sqlite3
# 输出: /usr/bin/sqlite3
```

### 基本操作

```bash
# 1. 打开数据库
sqlite3 ./data/firewall.db

# 2. 查看所有表
.tables

# 3. 查看表结构
.schema traces

# 4. 查询数据
SELECT * FROM traces LIMIT 10;

# 5. 统计记录数
SELECT COUNT(*) FROM traces;

# 6. 按威胁等级统计
SELECT threat_level, COUNT(*)
FROM traces
GROUP BY threat_level;

# 7. 查看最近的阻止记录
SELECT id, method, threat_level, timestamp
FROM traces
WHERE verdict = 'BLOCK'
ORDER BY timestamp DESC
LIMIT 10;

# 8. 退出
.quit
```

### 实用命令

```bash
# 导出数据为 CSV
sqlite3 ./data/firewall.db \
  "SELECT * FROM traces;" \
  -csv -header > traces.csv

# 导出数据为 JSON
sqlite3 ./data/firewall.db \
  "SELECT json_object(
    'id', id,
    'method', method,
    'verdict', verdict
  ) FROM traces;" > traces.json

# 备份数据库
sqlite3 ./data/firewall.db ".backup ./data/firewall_backup.db"

# 查看数据库大小
ls -lh ./data/firewall.db

# 优化数据库（压缩空间）
sqlite3 ./data/firewall.db "VACUUM;"
```

## Python 代码中使用 SQLite

### 基本用法

```python
from src.storage import get_storage_backend

# 获取 SQLite 存储后端
storage = get_storage_backend(
    backend_type="sqlite",
    db_path="./data/firewall.db"
)

# 保存轨迹
trace_id = await storage.save_trace({
    "session_id": "sess-123",
    "method": "tools/call",
    "verdict": "BLOCK",
    "threat_level": "HIGH",
    "messages": [...],
    "analysis": {...}
})

# 查询轨迹
traces = await storage.list_traces(
    filters={"verdict": "BLOCK"},
    limit=10,
    offset=0
)

# 获取单个轨迹
trace = await storage.get_trace(trace_id)
```

### 高级查询

```python
# 按时间范围查询
traces = await storage.list_traces(
    filters={
        "timestamp_gte": 1708300000.0,
        "timestamp_lte": 1708400000.0
    }
)

# 按威胁等级查询
high_threats = await storage.list_traces(
    filters={"threat_level": "HIGH"}
)

# 组合条件查询
blocked_high_threats = await storage.list_traces(
    filters={
        "verdict": "BLOCK",
        "threat_level": "HIGH"
    }
)
```

## 数据迁移

### 从 JSONL 迁移到 SQLite

```bash
# 使用迁移工具（待实现）
python -m src.tools.migrate --from jsonl --to sqlite

# 或手动导入
python << 'EOF'
import asyncio
import json
from src.storage import get_storage_backend

async def migrate():
    jsonl_storage = get_storage_backend("jsonl", data_dir="./audit")
    sqlite_storage = get_storage_backend("sqlite", db_path="./data/firewall.db")

    # 读取 JSONL 文件
    with open("./audit/firewall.jsonl") as f:
        for line in f:
            trace = json.loads(line)
            await sqlite_storage.save_trace(trace)

    print("Migration completed!")

asyncio.run(migrate())
EOF
```

## 性能优化

### 索引

SQLite 会自动为主键创建索引。对于频繁查询的字段，可以添加额外索引：

```sql
-- 为 verdict 字段创建索引
CREATE INDEX idx_traces_verdict ON traces(verdict);

-- 为 timestamp 字段创建索引
CREATE INDEX idx_traces_timestamp ON traces(timestamp);

-- 组合索引
CREATE INDEX idx_traces_verdict_timestamp
ON traces(verdict, timestamp);
```

### 查询优化

```sql
-- 使用 EXPLAIN QUERY PLAN 查看查询计划
EXPLAIN QUERY PLAN
SELECT * FROM traces WHERE verdict = 'BLOCK';

-- 使用 ANALYZE 更新统计信息
ANALYZE;
```

## 故障排查

### 数据库被锁定

```bash
# 错误: database is locked
# 原因: 另一个进程正在写入数据库

# 解决方法 1: 等待其他进程完成
# 解决方法 2: 检查是否有僵尸进程
lsof ./data/firewall.db

# 解决方法 3: 增加超时时间（在代码中）
storage = get_storage_backend(
    backend_type="sqlite",
    db_path="./data/firewall.db",
    timeout=30.0  # 30 秒超时
)
```

### 数据库损坏

```bash
# 检查数据库完整性
sqlite3 ./data/firewall.db "PRAGMA integrity_check;"

# 如果损坏，尝试恢复
sqlite3 ./data/firewall.db ".recover" | sqlite3 ./data/firewall_recovered.db
```

### 磁盘空间不足

```bash
# 查看数据库大小
du -h ./data/firewall.db

# 清理旧数据
sqlite3 ./data/firewall.db "DELETE FROM traces WHERE timestamp < strftime('%s', 'now', '-30 days');"

# 压缩数据库
sqlite3 ./data/firewall.db "VACUUM;"
```

## 最佳实践

1. **定期备份** - 使用 `.backup` 命令或简单的文件复制
2. **监控大小** - SQLite 单文件最大 281TB，但建议保持在几 GB 以内
3. **使用事务** - 批量操作时使用事务提高性能
4. **定期 VACUUM** - 压缩数据库，回收空间
5. **添加索引** - 为常用查询字段添加索引

## 与 JSONL 对比

| 特性       | SQLite       | JSONL            |
| ---------- | ------------ | ---------------- |
| 查询速度   | 快（有索引） | 慢（全文件扫描） |
| 存储效率   | 高（二进制） | 低（文本）       |
| 复杂查询   | 支持 SQL     | 需要自己实现     |
| 并发写入   | 支持（有锁） | 简单追加         |
| 数据完整性 | 强（ACID）   | 弱               |
| 部署复杂度 | 低           | 极低             |
| 适用场景   | 生产环境     | 开发/测试        |

## 总结

- ✅ SQLite **无需启动服务**，应用启动时自动连接
- ✅ 数据库文件会**自动创建**，无需手动初始化
- ✅ 使用 `sqlite3` 命令行工具可以**直接查看和操作**数据
- ✅ 通过 `.env` 配置 `AF_STORAGE_BACKEND=sqlite` 即可启用
- ✅ 已安装 `aiosqlite` 库，支持异步操作

现在你可以直接使用 SQLite 了！
