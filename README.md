# DMC eQMS – Hệ thống quản lý ISO & Chất lượng điện tử

> Project này chuyển file Excel ISO (Master Plan T10/2026–T12/2027, Action List, theo dõi tài liệu) thành **phần mềm eQMS** với kiến trúc Modular Monolith.

## Cấu trúc

```text
prj_eQMS/
├── eQMS_SOFTWARE_DESIGN_PROMPT.md   # Design prompt đầy đủ (28 sections + tech stack)
├── docs/
│   ├── requirements.md              # Step 1 – Requirement MVP + ma trận quyền
│   ├── architecture.md              # Step 2 – Kiến trúc target + prototype
│   ├── erd.md                       # Step 3 – ERD (Mermaid, 17 bảng)
│   └── database-schema.md           # Step 4 – PostgreSQL DDL + seed
├── frontend/                        # React prototype (MVP)
└── .agents/skills/skill_eqms/       # Skill tổng hợp cho AI agent
```

## Chạy dự án (development – không cần Docker)

### 0. Yêu cầu môi trường
- **PHP 8.2+** (dev hiện tại: Laragon với PHP 8.2.28) + Composer + ext `pdo_mysql`, `openssl`.
- **MySQL 8** (dev hiện tại: Laragon MySQL 8.0.30) – database **`eqms`**.
- **Node.js 18+** + npm.

### 1. Backend (Laravel 11) – `http://127.0.0.1:8000`

```powershell
# Windows (PowerShell) – thêm PHP vào PATH tạm (điều chỉnh theo máy bạn):
$env:PATH = 'C:\laragon\bin\php\php-8.2.28-Win32-vs16-x64;' + $env:PATH
cd backend
composer install
copy .env.example .env          # rồi chỉnh DB nếu cần
php artisan key:generate
php artisan migrate:fresh --seed   # seed demo khớp fixtures FE (8 user, 16 task, 8 doc, 6 action)
php artisan serve                # http://127.0.0.1:8000  (API prefix /api)
```

Cách khác với **Laragon**: tạo VirtualHost trỏ vào `backend/public/` (ví dụ `eqms.test` với port 8000) – FE đổi `VITE_API_URL` cho khớp.

- Env backend: `backend/.env` (mẫu tại `.env.example` – MySQL `eqms`, timezone `Asia/Ho_Chi_Minh`, `FRONTEND_URL=http://localhost:5173` cho CORS). Không commit `.env` thật.
- Test BE: `php artisan test` (cần database test được cấu hình an toàn; AI history feature test chưa xác minh trong môi trường thiếu `pdo_sqlite`).

### 2. Frontend (React + Vite) – `http://localhost:5173`

```powershell
cd frontend
npm install
# env: copy .env.example → .env (hoặc dùng .env.development có sẵn)
npm run dev        # dev server → http://localhost:5173 (gọi API thật tại VITE_API_URL)
npm run build      # tsc + vite build → dist/
npm run preview    # xem bản build
npm test           # Vitest (117 tests; regression suite frontend)
```

- Env FE (`frontend/.env` / `.env.development`): `VITE_API_URL=http://127.0.0.1:8000`, `VITE_USE_MOCK=false` (đổi `true` để chạy mock in-memory, không cần backend). **Không** đặt secret vào biến `VITE_*` (bị nhúng vào bundle JS).
- CORS: backend cho phép origin `FRONTEND_URL` (mặc định `http://localhost:5173`), methods GET/POST/PUT/PATCH/DELETE/OPTIONS, headers `Accept/Authorization/Content-Type/X-Requested-With`, **không** bật credentials (dùng Bearer Token).
- Auth: đăng nhập → nhận Bearer Token (Sanctum) → header `Authorization: Bearer <token>` tự gắn; token hết hạn → tự logout.

### 3. Chạy nhanh 2 terminal
Terminal 1 (BE): `php artisan serve` · Terminal 2 (FE): `npm run dev` → mở `http://localhost:5173` và đăng nhập.

Có thể chạy `run-system.bat` ở thư mục gốc bằng CMD để chạy backend và frontend trong cùng một cửa sổ. Nhấn phím bất kỳ tại cửa sổ đó để dừng hai server; log được ghi trong `%TEMP%\eqms-api.log` và `%TEMP%\eqms-vite.log`. Launcher từ chối chạy nếu cổng 8000 hoặc 5173 đang được sử dụng, tự chạy migration và chỉ tạo roles/tài khoản demo nếu bảng `users` rỗng. Trên database mới, chạy `php artisan db:seed --force` nếu cần thêm dữ liệu mẫu cho các module. Nếu chưa đổi thông tin demo, đăng nhập `admin` / `Admin123!`.

## Tài khoản demo (RBAC)

| Vai trò | Username | Mật khẩu | Quyền nổi bật |
|---|---|---|---|
| System Admin | `admin` | `Admin123!` | Toàn quyền + menu Quản trị |
| ISO Leader | `leader` | `Leader123!` | Phê duyệt, ban hành tài liệu, đóng Action |
| ISO Deputy | `deputy` | `Deputy123!` | Quản lý Master Plan, submit/review tài liệu |
| ISO Coordinator | `coordinator` | `Coord123!` | Cập nhật tiến độ task, xác minh Action |
| Document Owner | `owner` | `Owner123!` | Soạn thảo, gửi thẩm định tài liệu |
| Department Manager | `manager` | `Manager123!` | Review + approve tài liệu |
| Auditor | `auditor` | `Audit123!` | Xem + tạo Action |
| Normal User | `user` | `User123!` | Chỉ xem + cập nhật Action của mình |

**Hãy thử:** đăng nhập `user` → không thấy menu Quản trị, vào `/admin` → 403, không thấy nút Phê duyệt. Đăng nhập `leader` → phê duyệt/ban hành tài liệu được, **Từ chối bắt buộc nhập comment**.

## Nguyên tắc đã implement

- **RBAC `module.action`** – Laravel kiểm tra quyền ở backend; UI ẩn menu/nút theo quyền và mock API mô phỏng lỗi 401/403 trong development.
- **Workflow configurable theo transition** – mỗi trạng thái tài liệu map {transition → permission → trạng thái đích}, không hard-code chuỗi `B1–B5`.
- **Traceability** – task ↔ document ↔ action liên kết bằng FK; tài liệu có lịch sử version + phê duyệt (expand row).
- **Audit log** – mọi login/status change ghi vào `activity_logs`.
- **API thật / mock:** mặc định frontend gọi Laravel API qua `services/api.ts` + Bearer token; `VITE_USE_MOCK=true` chỉ dùng mock in-memory phục vụ development/test.
- **Không tin frontend** – Laravel kiểm tra quyền và validate workflow; mock API vẫn mô phỏng lỗi 401/403/409/400 cho development.
- **State management** – Redux Toolkit (`src/store/slices` + `createAsyncThunk`), data hooks ở `src/hooks/queries.ts` (giữ interface `useMasterPlan().data`, `updateTask.mutate(...)` để pages không đổi nhiều).
- **Dashboard charts** – Apache ECharts: donut Task theo trạng thái, bar Tiến độ theo giai đoạn, pie Task theo ưu tiên (data agregate từ `dashboard` API).
- **Master Plan** – filter theo phụ trách/trạng thái/nhóm công việc (bao gồm Quá hạn); group mặc định theo nhóm công việc, có thể group theo phụ trách/trạng thái; hiển thị tổng công việc và số lượng trong từng nhóm.
- **Gantt Chart** – mở trong modal ngay tại Master Plan theo kế hoạch đang chọn; menu Gantt riêng đã bỏ. Route `/gantt` vẫn được giữ cho truy cập trực tiếp.
- **AI-RAG & AI provider** – Dashboard phân tích qua OpenAI GPT hoặc Google Gemini, hỗ trợ xem Markdown/GFM và lưu 10 phân tích gần nhất theo người dùng trong `ai_analyses`. API key của provider được cấu hình phía người dùng và không được lưu trong lịch sử phân tích.
- **Theme** – chuyển giao diện sáng/tối từ dropdown người dùng; lựa chọn được lưu trong localStorage.

## Trạng thái & Phase tiếp

**Đã làm:** Backend Laravel 11 (Sanctum Bearer, API camelCase, RBAC + workflow rules, AI analysis history endpoints) · Frontend React gọi API thật (`services/api.ts` + Redux Toolkit + ECharts) · AI-RAG với GPT/Gemini · Master Plan filter/group/Gantt modal · theme sáng/tối.

**Phase tiếp:** Mở rộng Phase 2 (Audit, CAPA, Notification – xem `docs/requirements.md`); triển khai production (PostgreSQL/HTTPS/domain thật – đổi `FRONTEND_URL`, `VITE_API_URL`); xem `docs/document.md` + `.agents/skills/skill_eqms/SKILL.md` để biết trạng thái chi tiết và các giới hạn kiểm thử.
