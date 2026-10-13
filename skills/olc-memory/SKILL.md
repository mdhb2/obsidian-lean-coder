---
name: olc-memory
description: Cari dan perbarui catatan memori proyek secara progresif — baca yang kecil dulu, hanya yang relevan dengan query. Tidak pernah memindai seluruh vault.
---

# olc-memory

Ingatan berlingkup proyek: baca `index.md` + `current-state.md` dulu, lalu hanya dokumen `memory/` + `decisions/`, doc task, dan event log yang relevan dengan query. Tulis balik hanya di scope proyek yang tervalidasi.

## Aturan keras

1. **Identitas dulu.** `validateIdentity` harus lolos sebelum baca/tulis apa pun. Proyek salah atau vault tak tersedia → gagal dengan nol file tersentuh.
2. **Tidak memindai folder proyek lain.** Semua path di-resolve di dalam `<vault>/OLC/Projects/<id>/`; folder lain tidak tersentuh secara konstruksi.
3. **Tulis terkontrol.** `recordMemory` butuh nama polos (huruf/angka/dash/underscore, tanpa path/ekstensi) + konten non-kosong; file yang sudah ada tidak ditimpa diam-diam (`overwrite` eksplisit).

## Alur

1. Panggil `recallMemory({ projectRoot, config, query?, taskId?, includeLogs?, logLimit?, limit? })` — tanpa query = konteks dasar (index + state + log terbaru, tanpa filter).
2. Dengan query: token query difilter stopwords, skor per dokumen `memory/` + `decisions/` (bobot nama file), kutipan dibatasi 1200 karakter dengan flag truncasi, urutan skor terbaik dulu.
3. Dengan `taskId`: sertakan status doc intent/plan task itu (hilang → null, bukan error).
4. Untuk menyimpan: `recordMemory({ projectRoot, config, name, content, overwrite? })` → `memory/<name>.md` atomik.

## Verifikasi skill ini

- Ingatan proyek A tidak pernah muncul saat recall di proyek B (isolasi multi-proyek).
- Setiap klaim relevansi bisa ditelusur ke dokumen + barisnya, bukan karangan.
