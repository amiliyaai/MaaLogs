# 发布流程

## 版本配置

在 `src-tauri/tauri.conf.json` 中配置版本号：

```json
{
  "version": "2.0.1-beta.1",
  "bundle": {
    "targets": ["nsis"]
  }
}
```

**版本号规则：**

- NSIS 打包支持预发布标识符（如 `2.0.1-beta.1`）
- 语义版本比较：`2.0.1-beta.1` < `2.0.1`（预发布 < 正式版）

**GitHub Tag 与版本号对应：**
| 类型 | tauri.conf.json | GitHub Tag |
|------|-----------------|------------|
| 正式版 | `2.0.1` | `v2.0.1` |
| 测试版 | `2.0.1-beta.1` | `v2.0.1-beta.1` |
| RC版 | `2.0.1-rc.1` | `v2.0.1-rc.1` |

## 正式发布

```bash
# 1. 更新版本号
# 编辑 src-tauri/tauri.conf.json 中的 version

# 2. 提交并打标签
git add .
git commit -m "chore: 更新版本到 x.x.x"
git tag vx.x.x
git push origin main --tags
```

## 预发布（测试版）

```bash
# 发布 beta 版本
git tag vx.x.x-beta.1
git push origin vx.x.x-beta.1

# 发布 rc 版本
git tag vx.x.x-rc.1
git push origin vx.x.x-rc.1
```

## 删除已存在的 Tag

```bash
# 删除本地 tag
git tag -d vx.x.x

# 删除远程 tag
git push origin --delete vx.x.x

# 重新创建
git tag vx.x.x
git push origin vx.x.x
```

## 版本命名规则

| 类型   | 示例            | 说明                        |
| ------ | --------------- | --------------------------- |
| 正式版 | `v1.0.0`        | 标记为 Latest，自动更新推送 |
| Alpha  | `v1.0.0-alpha`  | 内部测试版                  |
| Beta   | `v1.0.0-beta.1` | 公开测试版                  |
| RC     | `v1.0.0-rc.1`   | 发布候选版                  |

## 注意事项

- 预发布版本不会标记为 Latest
- 自动更新只推送正式版
- 发布前确保 `tauri.conf.json` 版本号已更新
