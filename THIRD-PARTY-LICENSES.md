# 第三方代码许可汇总（Third-Party Licenses）

本展项为纯本地离线交付，下列第三方代码/素材均已随包 vendor，无运行时外网依赖。
许可证全文见 `web/vendor/LICENSES/`。

## 代码

| 组件 | 版本/来源 | 许可证 | 本项目用途 | 许可证全文 |
|---|---|---|---|---|
| three.js | r185，https://github.com/mrdoob/three.js | MIT | 3D 渲染引擎；`web/vendor/three/`（含 examples/jsm 的 GLTFLoader、BufferGeometryUtils、SkeletonUtils） | `web/vendor/LICENSES/three-MIT.txt` |
| postprocessing | v6.39.4，https://github.com/pmndrs/postprocessing | Zlib | 选择性辉光/暗角/颗粒/色调映射（`web/vendor/postprocessing/index.js`，零依赖预构建 ESM，peer `three>=0.168 <0.186`） | `web/vendor/LICENSES/postprocessing-ZLIB.txt` |
| MediaPipe Tasks Vision | 1.0.1，https://github.com/google-ai-edge/mediapipe | Apache-2.0 | 手部关键点追踪（`web/vendor/mediapipe/`，含双 wasm 与模型） | `web/vendor/LICENSES/mediapipe-Apache-2.0.txt`（按 Apache-2.0 第 4 条保留许可声明） |
| TrailRenderer | honzaap/SlashSaber（https://github.com/honzaap/SlashSaber），原算法 © Mark Kellogg (TrailRendererJS)，TS 移植 © honzaap | **CC-BY-4.0** | 剑气 ribbon 拖尾几何引擎，移植于 `src/game/libs/TrailRenderer.ts` → `web/js/fx/trail.js` | `web/vendor/LICENSES/SlashSaber-CC-BY-4.0.txt` |

### CC-BY-4.0 署名与改动说明（SlashSaber TrailRenderer）

- 原项目：SlashSaber（https://github.com/honzaap/SlashSaber），许可 CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）。
- 原算法作者：Mark Kellogg（TrailRendererJS，https://github.com/mkkellogg）。
- 本项目改动（`web/js/fx/trail.js` 文件头亦有注明）：TypeScript → 原生 ESM JavaScript；BufferAttribute 改用 `setUsage(DynamicDrawUsage)`；
  新增加色软边发光 shader（`createGlowMaterial`）；移除纹理/类型系统依赖。

### 阵型算法说明

万剑集结/编队/steering 的数学参考了 zwj-3193655211/wanjian「指尖万剑」公开的阵型思路
（该仓库 package.json/README 声明 MIT，但截至集成日仓库根无独立 LICENSE 文件）。
本项目**未复制其代码**，相关数学在 `web/js/fx/volley.js` 中以 vanilla JS 独立重写；
正式商用前建议取得该仓库 LICENSE 全文并归档。

## 素材

| 素材 | 来源 | 许可证 | 用途 |
|---|---|---|---|
| 低模剑（sword_1handed、sword_2handed_color） | KayKit Adventurers Character Pack 1.0，Kay Lousberg（www.kaylousberg.com） | **CC0 1.0**（无需署名，可商用） | 万剑阵与本命剑模型，`web/assets/models/`（连同其 knights 图集） |
| 霞鹜文楷 Lite | https://github.com/lxgw/LxgwWenKai-Lite，© LXGW，基于 Klee（© Fontworks，SIL OFL） | **SIL OFL 1.1** | UI/法阵中文字体；已按实际用字**子集化**为 woff2（`web/assets/fonts/`，约 40KB/字重），仅用于 Web 嵌入分发，符合 OFL 与作者附加条款 |

CC0 与 OFL 全文：KayKit 许可见 `web/vendor/LICENSES/KayKit-CC0.txt`（内含 CC0 链接）；
OFL 见 `web/vendor/LICENSES/LXGW-WenKai-OFL-1.1.txt`。

## 自有资产

其余全部视觉资产（天空/云海/月海/远山 shader、粒子、UI 引导图形、音效合成代码）
均为本项目程序化生成，版权归甲方公司所有。
