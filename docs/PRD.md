# OLC — Product Requirements Document (PRD)

- **Nama:** OLC — Obsidian Lean Coder
- **Status:** Draft siap dieksekusi dan direview selama implementasi
- **Versi dokumen:** 0.1
- **Tanggal:** 2026-10-12
- **Target:** MVP untuk OpenCode, didistribusikan sebagai package npm

## 1. Ringkasan produk

OLC adalah ekstensi untuk OpenCode yang membantu menjaga alur coding tetap terarah dan dapat dilanjutkan lintas sesi melalui rencana kerja, catatan Obsidian, log aktivitas, checkpoint Git, dan preferensi proyek yang disetujui pengguna.

OLC bukan sistem wiki kode dan bukan orchestrator umum. Fokus MVP adalah membuat dua agent (`olc-plan`, `olc-build`) dan beberapa skill pendukung bekerja konsisten dengan konteks proyek yang tersimpan di vault Obsidian, sambil melindungi kode dan keputusan pengguna.

## 2. Masalah yang ingin diselesaikan

1. Konteks kerja dan keputusan mudah hilang ketika sesi coding terputus.
2. Agent bisa mulai coding sebelum tujuan dan kriteria selesai disepakati.
3. Sulit mengetahui versi kode mana yang sesuai dengan langkah pekerjaan tertentu.
4. Preferensi pengguna bisa berulang kali dijelaskan dan berisiko diterapkan lintas proyek tanpa konteks.
5. Perubahan di luar lingkup dapat menyebar tanpa persetujuan eksplisit.

## 3. Sasaran MVP

- Bisa dipasang lewat npm dan dimuat sebagai plugin OpenCode.
- Menyediakan cara inisialisasi proyek OLC yang aman/idempotent.
- Mendukung `olc-plan` dan `olc-build` dengan batas kewenangan berbeda.
- Menyediakan pilihan Explore atau Plan langsung.
- Menyimpan `intent.md`, `plan.md`, checkpoint, log, ringkasan sesi, memori, serta taste rules di Obsidian Markdown.
- Menghubungkan checkpoint ke commit Git yang dapat ditemukan kembali.
- Memulihkan konteks dari source code, Git, rencana, dan log setelah sesi terputus.
- Menjaga persetujuan pengguna atas rencana, perubahan lingkup, aturan preferensi, dan penutupan task.
- Selalu menutup sesi normal dengan ringkasan bahasa awam.

## 4. Bukan sasaran MVP

- Dashboard web atau desktop.
- Database terpisah untuk menyimpan memory.
- Integrasi MCP wajib.
- Auto-switch branch, auto-create branch, worktree isolation, atau perubahan branch otomatis.
- Pembelajaran yang langsung mengubah instruksi/skill tanpa persetujuan.
- Memigrasikan seluruh dokumen lama ketika template berubah.
- Jaminan bahwa log akhir tetap terbentuk jika proses mati seketika. MVP perlu berusaha merekam event penting dan menjelaskan batas kehilangan event.
- Sistem autopilot bebas yang memperluas scope sendiri.

## 5. Pengguna dan lingkungan

Pengguna utama adalah developer yang memakai OpenCode untuk mengembangkan satu atau beberapa repository aplikasi, dan memakai Obsidian sebagai penyimpanan catatan.

Lingkungan target:
- Node.js/npm untuk instalasi package dan tooling pengembangan.
- OpenCode dengan plugin API yang kompatibel.
- Git tersedia untuk fitur checkpoint.
- Obsidian vault berupa folder lokal yang bisa dibaca/ditulis oleh proses OpenCode.

Versi minimum OpenCode dan Node.js akan diverifikasi terhadap API yang dipakai sebelum rilis. Jangan menyalin klaim versi dari package referensi tanpa pengujian OLC sendiri.

## 6. Prinsip produk

1. **Source over assumption:** periksa source repo, Git, dan dokumen sebelum menyimpulkan.
2. **Vault is required:** bila vault tidak tersedia atau `project_id` tidak cocok, hentikan operasi OLC yang dapat membaca/menulis konteks salah. Jangan diam-diam membuat fallback lokal.
3. **User approves scope:** perubahan tujuan, lingkup, acceptance criteria, dan taste rule aktif perlu persetujuan.
4. **Git is ground truth for code:** log dan memory tidak menggantikan kondisi Git dan source code.
5. **No destructive restore:** jangan menimpa atau membuang perubahan yang tidak terkait.
6. **Lean artifacts:** buat hanya catatan yang membantu eksekusi, audit, atau pemulihan.
7. **Plain-language session summary:** setiap akhir sesi normal, jelaskan hasil, pekerjaan tersisa, risiko, dan langkah lanjut dengan bahasa awam.

## 7. Ruang lingkup fungsional

### 7.1 Distribusi dan instalasi npm

OLC diterbitkan sebagai package npm dengan entrypoint plugin OpenCode.

Target pengalaman pengguna setelah package dirilis:

```bash
npm install @<scope>/olc
```

Nama package final belum ditetapkan. Sebelum publikasi, tentukan nama npm yang tersedia dan konsisten dengan nama repository. Dokumentasikan setup konfigurasi OpenCode yang benar. Jika OpenCode mengelola package plugin melalui konfigurasi `plugin`/`plugins` dan cache sendiri, jelaskan perbedaan antara memasang package untuk development dan mengaktifkan plugin untuk penggunaan normal. Jangan mengklaim `npm install` di folder proyek otomatis mengaktifkan plugin OpenCode jika hal itu tidak diimplementasikan.

MVP perlu menyediakan:
- package metadata yang benar (`name`, `version`, `type`, `exports` atau entrypoint yang diperlukan, `files`, `engines`, `license` bila ditentukan).
- TypeScript build dan artefak distribusi yang masuk package.
- panduan quickstart, konfigurasi, upgrade, uninstall, troubleshooting.
- uji package tarball dengan `npm pack` dan instalasi lokal di proyek uji.
- tidak menjalankan operasi destruktif pada proyek pengguna saat install.

### 7.2 Dua agent

**`olc-plan`**
- Menggunakan instruksi dasar agent Plan OpenCode sebagai fondasi, lalu menambahkan aturan OLC.
- Boleh membaca repository dan Git untuk memahami konteks.
- Tidak boleh menulis atau mengubah source code aplikasi.
- Boleh menulis dokumen OLC di vault yang terkonfigurasi.
- Pada task baru, merekomendasikan Explore untuk masalah kompleks/tidak jelas dan Plan langsung untuk masalah sederhana, tetapi pengguna memilih.
- Membuat `intent.md` (apa dan mengapa) serta `plan.md` (cara dan verifikasi) sebagai satu paket review.
- Tidak boleh memulai implementasi sebelum keduanya disetujui.

**`olc-build`**
- Menggunakan instruksi dasar agent Build OpenCode sebagai fondasi, lalu menambahkan aturan OLC.
- Harus membaca root `AGENTS.md` dan `.olc/AGENTS.md` secara eksplisit sesuai konfigurasi.
- Memverifikasi project ID, repository aktif, branch, dan status Git sebelum operasi penting.
- Melaksanakan hanya plan yang berstatus approved.
- Boleh membuat keputusan teknis kecil dan memperbaiki kesalahan dalam lingkup yang disetujui.
- Harus berhenti untuk perubahan tujuan, lingkup, acceptance criteria, atau keputusan berisiko.
- Memeriksa test yang relevan, melaporkan bukti, membuat checkpoint aman, lalu meminta konfirmasi pengguna sebelum menutup task.

### 7.3 Skill MVP

- `olc-init`: inisialisasi proyek dan vault secara aman/idempotent.
- `olc-explore`: eksplorasi opsional untuk task yang kompleks/tidak jelas; adaptasi terbatas dari skill referensi, bukan adopsi workflow LCS.
- `olc-memory`: mencari dan memperbarui catatan memori yang relevan secara progresif.
- `olc-log`: mencatat event penting, checkpoint, dan ringkasan sesi.
- `olc-taste`: menangkap pola preferensi, membuat usulan taste rule, menunggu persetujuan sebelum aktivasi.

Skill bisa dipanggil manual atau oleh agent. Self-modification skill bukan bagian MVP.

### 7.4 Inisialisasi proyek

`olc-init` harus:
- Menjelaskan apa yang akan dibuat sebelum memulai perubahan.
- Meminta lokasi vault jika belum ada konfigurasi yang valid.
- Mengusulkan `project_id` dari nama repository lalu meminta persetujuan.
- Mendeteksi `project_id` duplikat dan meminta keputusan jika ditemukan.
- Meminta/menyusun isi `.olc/AGENTS.md` untuk direview pengguna.
- Membuat struktur direktori/file yang hilang.
- Mempertahankan file pengguna yang sudah ada; tidak menimpa konfigurasi atau instruksi tanpa persetujuan.
- Melaporkan file dibuat, dipertahankan, dilewati, atau memerlukan perhatian.
- Menyediakan mode dry-run bila feasible sebelum mutasi filesystem.

### 7.5 Konfigurasi dan validasi konteks

Konfigurasi proyek ada di `.olc/config.json`. Konfigurasi minimal mengandung `project_id`, versi skema, jalur vault yang diselesaikan atau aturan rujuk ke `OLC_VAULT_PATH`, dan preferensi proyek yang memang perlu disimpan. Hindari menyimpan rahasia.

Sebelum membaca/menulis memory, plan, explore report, log, checkpoint, atau taste rule, OLC memeriksa:
1. `project_id` dari config.
2. Repository root/identitas Git aktual.
3. Branch aktif dan hubungan branch dengan task bila relevan.
4. Registry proyek di vault.
5. Vault bisa diakses.

Jika ada mismatch, hentikan operasi terkait, jelaskan bukti mismatch, dan minta penyelesaian. Validasi dilakukan ketika sesi dimulai dan sebelum operasi penting, bukan dengan membaca ulang seluruh vault.

### 7.6 Penyimpanan vault

Obsidian Markdown adalah sumber utama memory. Struktur awal yang disarankan:

```text
OLC/
├── Projects.md
└── Projects/
    └── <project_id>/
        ├── index.md
        ├── current-state.md
        ├── decisions/
        ├── tasks/
        │   └── <task-id>/
        │       ├── intent.md
        │       ├── plan.md
        │       ├── checkpoint.md
        │       ├── history.md
        │       └── explore/report.md   # hanya bila Explore dipakai
        ├── logs/
        ├── memory/
        └── taste/
```

Template master berada di repository OLC (`templates/`). Tidak ada template master duplikat di vault. Template baru tidak otomatis memigrasikan dokumen lama.

### 7.7 Intent dan plan

Satu unit implementasi memiliki tepat satu dokumen `intent.md` dan satu `plan.md` terkini.
- `intent.md`: masalah, alasan, hasil yang diinginkan, batasan, pengguna/area terdampak jika diketahui, pertanyaan terbuka.
- `plan.md`: task modular, hasil per task, acceptance criteria, test/verifikasi, dependency dan risiko yang relevan.
- Task bersifat modular dan berorientasi hasil, bukan microtask.
- `olc-plan` menghasilkan keduanya bersama-sama untuk review pengguna.
- Perubahan kecil pada draft memperbarui dokumen terkini; riwayat penting dan alasan perubahan dipertahankan di `history.md` atau decision record.
- Perubahan lingkup setelah approval mengembalikan pekerjaan terdampak ke `olc-plan`; implementasi tidak berlanjut sampai dokumen direvisi dan disetujui lagi.

### 7.8 Task dan branch

- Satu branch mempunyai satu task utama dan bisa memiliki task terkait.
- Tiap task terkait mempunyai status dan checkpoint sendiri.
- OLC tidak otomatis membuat atau berpindah branch.
- Jika branch aktif cocok dengan task terdaftar, OLC menunjukkan konteks dan merekomendasikan task terakhir yang aktif, lalu meminta konfirmasi.
- Jika branch tidak dikenal/ambigu, tanyakan makna branch; jangan menyimpulkan hanya dari nama branch/commit.
- Jika ditemukan task yang mungkin usang, OLC menyarankan lanjutkan/revisi/batalkan tetapi tidak mengubah status tanpa persetujuan.
- Status awal kandidat: `draft`, `approved`, `in_progress`, `blocked`, `paused`, `done`, `superseded`, `cancelled`. Kontrak transisi final dibuat dan diuji pada tahap implementasi task state.

### 7.9 Logging, checkpoint, dan pemulihan

OLC membedakan:
- **Activity log:** kronologi event penting, bukan semua tool call.
- **Session summary:** ringkasan sesi yang menggunakan bahasa awam.
- **Checkpoint record:** deskripsi keadaan kerja dan referensi commit.
- **Git commit:** snapshot kode nyata.

Checkpoint:
- Dibuat pada momen penting, saat diminta, sebelum pergantian task, dan sebagai checkpoint final setelah task memenuhi kondisi penyelesaian yang terverifikasi.
- Tiap checkpoint yang sukses harus memiliki commit khusus dengan pesan jelas dan record log yang mengarah pada commit.
- Hanya perubahan milik OLC dan sesuai scope yang boleh masuk ke checkpoint. Perubahan manual/pekerjaan lain harus tetap terpisah.
- Jika perubahan bercampur dan tidak dapat dipisahkan dengan aman, OLC berhenti dan meminta arahan.
- Jangan membuat commit dari semua perubahan tanpa pemeriksaan.
- Restore ke checkpoint lama dilakukan dengan menerapkan kembali isi kode checkpoint melalui perubahan baru yang menjaga riwayat, bukan menghapus commit sesudahnya atau memaksa reset branch secara diam-diam.
- Sebelum restore, periksa status Git, diff, untracked files, current branch, dan data yang berpotensi hilang. Jika ada risiko, jangan lanjut tanpa persetujuan.
- Commit tidak sama dengan task selesai.

### 7.10 Resume dan perpindahan task

Saat pengguna beralih task, OLC menyimpan checkpoint/catatan kondisi terlebih dahulu jika aman.

Saat resume:
1. Periksa repository root, branch, HEAD commit, status Git, diff, dan untracked files.
2. Baca index proyek, current state, intent/plan terkait, log terbaru, dan checkpoint.
3. Rekomendasikan task terakhir yang aktif.
4. Tampilkan progres, test terakhir, perubahan yang belum di-commit, dan next step.
5. Minta konfirmasi sebelum coding dilanjutkan.

Jika vault tidak tersedia, hentikan aktivitas yang memerlukan OLC; jangan membuat fallback diam-diam. Untuk pemutusan mendadak, log event dapat membantu pemulihan, tetapi tidak boleh menjanjikan bahwa event terakhir selalu tersimpan.

### 7.11 Verifikasi dan penutupan task

- `olc-build` memperbaiki masalah selama masih dalam scope dan mencoba solusi secara terbatas.
- Jika tetap gagal, berisiko, atau butuh perubahan scope, hentikan dan laporkan apa yang dicoba, hasil, risiko, serta opsi.
- Setelah pekerjaan, cocokkan hasil terhadap acceptance criteria dan jalankan test yang relevan.
- Jangan menyatakan test berhasil tanpa hasil nyata.
- Setelah laporan verifikasi dan checkpoint aman, minta konfirmasi pengguna sebelum menandai task `done`.
- Sesi normal selalu diakhiri ringkasan bahasa awam: apa dikerjakan, hasil, yang belum selesai, risiko/blocker, next step.

### 7.12 Taste memory

- Taste memory selalu scoped per proyek.
- OLC boleh merekam sinyal koreksi/accept/reject dan pola berulang.
- Pola berulang menghasilkan usulan aturan berstatus `pending`.
- Hanya setelah persetujuan pengguna, aturan menjadi `active`.
- Aturan baru tidak boleh diam-diam menimpa intent/plan yang disetujui.

## 8. Struktur repository produk yang dituju

Struktur ini adalah target desain, tidak harus semua file dibuat pada task pertama:

```text
olc/
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # OpenCode plugin entrypoint
│   ├── config/
│   ├── core/
│   │   ├── project-identity.ts
│   │   ├── vault.ts
│   │   ├── state.ts
│   │   └── errors.ts
│   ├── git/
│   │   ├── inspection.ts
│   │   ├── checkpoint.ts
│   │   └── restore.ts
│   ├── logging/
│   ├── tools/                   # tools exposed to agents if needed
│   └── validation/
├── agents/
│   ├── olc-plan.md
│   └── olc-build.md
├── skills/
│   ├── olc-init/SKILL.md
│   ├── olc-explore/SKILL.md
│   ├── olc-memory/SKILL.md
│   ├── olc-log/SKILL.md
│   └── olc-taste/SKILL.md
├── templates/
├── tests/
├── docs/
│   ├── PRD.md
│   └── TASKS.md
└── .github/workflows/ci.yml
```

Final layout must match actual OpenCode plugin discovery/API. Do not assume arbitrary `agents/` and `skills/` folders are loaded by OpenCode automatically. Plugin should either install/copy resources into supported locations with safe rules, or provide a documented explicit configuration mechanism. Verify against current OpenCode docs and automated tests.

## 9. Non-functional requirements

- **Safety:** no destructive Git/filesystem action without clear preconditions and protection of unrelated changes.
- **Idempotency:** rerunning init should not duplicate or overwrite existing user configuration.
- **Traceability:** plans, logs, checkpoints, and Git commits cross-reference each other.
- **Resilience:** recover as much as possible from durable records; report missing data rather than invent it.
- **Compatibility:** use supported OpenCode extension APIs and state tested version range.
- **Maintainability:** keep modules small and avoid unnecessary abstractions.
- **Privacy:** no telemetry or external data upload in MVP unless explicitly requested and documented.
- **Performance:** load only context relevant to the current task; avoid scanning the whole vault by default.
- **Usability:** error messages and end-of-session summaries use clear Indonesian/English as appropriate; core documentation can initially use Indonesian.

## 10. Acceptance criteria for MVP release

MVP is ready for a tagged pre-release when:

1. Package builds, test suite passes, lint/typecheck passes, and `npm pack` contains all required runtime resources.
2. A clean OpenCode test profile can load the installed package using the documented setup.
3. `olc-init` initializes a dummy repository and an Obsidian-like vault without overwriting existing files on repeat runs.
4. `olc-plan` can produce both intent and plan in Explore and direct-plan modes, with no app source modifications.
5. `olc-build` refuses to start without approved plan and refuses ambiguous/wrong-project memory context.
6. Plan/task state transitions and pause/resume scenarios are covered by tests.
7. Checkpoint commits include only intended changes; unrelated and untracked changes are protected.
8. Restore to an earlier checkpoint can recover code while preserving later history and preventing silent data loss.
9. Session event records and plain-language summary work for normal end and recoverable interruption cases; hard-kill limitations are documented.
10. Taste proposals stay pending until approved and are scoped to their project.
11. User receives a clear final report with tests run, checkpoint reference, unresolved problems, and next steps.

## 11. Risks and mitigation

| Risiko | Mitigasi |
|---|---|
| Plugin API changes | Pin/test supported OpenCode range; integration test with clean profile. |
| npm install misunderstood as plugin activation | Document install vs registration/activation; offer a tested installer or exact config snippet. |
| Accidental loss of manual code | Inspect status/diff; selective staging; abort if ownership cannot be distinguished; fixture tests. |
| Vault path or project mismatch | Explicit project ID and runtime validation; fail closed. |
| Over-logging | Record milestones and state transitions, not every tool call. |
| Session killed before summary | Incremental event persistence plus honest recovery limits. |
| Too much scope before testing | Prioritize vertical slice and postpone UI/MCP/advanced automation. |

## 12. Technical decisions to validate during implementation

- Final npm package name/scope and public name availability.
- Exact OpenCode plugin API / entrypoint and whether resources can be delivered by package, generated project files, or both.
- Exact supported OpenCode version range.
- Git CLI invocation strategy and supported platforms.
- Robust approach to separating agent changes from unrelated manual changes (this is a key safety spike).
- Whether automatic event logging is sufficiently reliable through supported plugin hooks or requires a small local recorder.
- Final task status transition table.

## 13. MVP milestones

1. **M0 — Foundations:** repository/package setup, CI, documentation skeleton.
2. **M1 — Installable vertical slice:** plugin loads and exposes minimal OLC status/init capability.
3. **M2 — Project setup and storage:** identity validation, vault adapter, safe idempotent init.
4. **M3 — Planning:** agents/skills/resources and intent/plan approval flow.
5. **M4 — Execution and verification:** scoped build behavior, tests, scope escalation.
6. **M5 — Git checkpoints:** safe commit creation, checkpoint registry, restore flow.
7. **M6 — Recovery and learning:** activity logs, resume, session summary, taste proposals.
8. **M7 — MVP hardening:** test matrix, package dry-run, docs, pre-release.

Prioritize an end-to-end vertical slice before implementing every advanced feature in parallel.
