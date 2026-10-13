---
name: olc-init
description: Daftarkan satu repo app + vault ke OLC secara aman dan idempotent. Create-only — tidak pernah menimpa file yang sudah ada.
---

# olc-init

Inisialisasi proyek OLC: mengusulkan `project_id`, mengonfirmasi vault path, menyiapkan `.olc/` dan struktur vault, lalu mendaftarkan pasangan repo↔vault di registry.

## Aturan keras

1. **Jelaskan dulu sebelum menulis.** Sebutkan file apa saja yang akan dibuat sebelum memanggil `initProject`.
2. **Create-only.** File yang sudah ada dilaporkan `preserved` — tidak pernah ditimpa. Yang butuh keputusan manusia dikembalikan sebagai `status: "needs-decision"` dengan pesan yang bisa ditindaklanjuti.
3. **Tidak ada tebakan vault.** Urutan: `vaultPath` eksplisit > env `OLC_VAULT_PATH` > config yang ada. Bila tidak ada, minta ke user — jangan membuat lokasi default diam-diam.
4. **Tidak ada prompting di dalam modul.** Kumpulkan jawaban dulu, lalu panggil ulang dengan parameter lengkap.

## Alur

1. Panggil `initProject({ projectRoot })` — dapatkan usulan `project_id` (turunan nama repo yang disanitasi).
2. Bila `status: "needs-decision"`, tanyakan ke user: konfirmasi `projectId`, isi `vaultPath`, atau selesaikan duplikat id sesuai pesan.
3. Panggil ulang dengan `{ projectRoot, projectId, vaultPath }` hingga `status: "ready"`.
4. Tanyakan ke user: "Apakah ada aturan tambahan proyek selain yang ada di
   AGENTS.md utama?" Bila ada, tulis ke bagian "Aturan tambahan proyek" di
   `<repo>/.olc/AGENTS.md` (file itu create-only — bila sudah ada dan sudah
   berisi aturan, jangan ditimpa; gabungkan hanya bila user meminta).
5. Laporkan ringkasan `created` / `preserved` / `attention` ke user dalam bahasa sederhana.
5. Untuk pratinjau tanpa menulis: `initProject({ ..., dryRun: true })` — `created` berarti "akan dibuat".

## Yang dibuat (hanya bila belum ada)

- `<repo>/.olc/config.json` — `{ schemaVersion, projectId, vaultPath }`. Kunci berbau kredensial (`secret|token|password|api-key`) ditolak.
- `<repo>/.olc/AGENTS.md` — stub instruksi, minta user meninjau dan menyesuaikan.
- `<vault>/OLC/Projects/<project_id>/{index.md, current-state.md, decisions/, tasks/, logs/, memory/, taste/}`
- Entri `{ projects: { "<id>": { repoRoot } } }` di `<vault>/OLC/registry.json`.

## Verifikasi skill ini

- Jalankan init dua kali di fixture repo/vault sementara: larian kedua semua `preserved`, tidak ada byte berubah.
- Init dengan config + instruksi kustom yang sudah ada: file kustom tetap identik.
