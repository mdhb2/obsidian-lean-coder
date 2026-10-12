---
name: olc-explore
description: Selidiki request yang kompleks/tidak pasti sebelum planning. Read-only terhadap app code; menghasilkan satu laporan eksplorasi di vault.
---

# olc-explore

Klarifikasi request yang kompleks atau tidak pasti **sebelum** `intent.md`/`plan.md` dibuat.
Untuk task sederhana yang sudah jelas, lewati skill ini dan langsung ke Plan (direct Plan).

## Kapan dipakai vs direct Plan

- Pakai Explore bila: request ambigu, menyentuh area yang belum dikenal, ada beberapa pendekatan dengan tradeoff nyata, atau risiko salah paham tinggi.
- Direct Plan bila: perubahan kecil dan terlokalisasi, pendekatan sudah jelas, tidak ada pertanyaan material yang terbuka.
- Pilihan user yang menang: kalau user minta direct Plan, jangan memaksa Explore, dan sebaliknya.

## Aturan keras

1. **Read-only terhadap app source.** Boleh membaca file, menjalankan perintah baca (status, log, test baca), menelusuri kode. DILARANG mengubah, menambah, atau menghapus file app dalam bentuk apa pun — tidak ada fix "sekalian", tidak ada refactor kecil.
2. Satu laporan aktif per task: `tasks/<task-id>/explore/report.md` di vault proyek yang sudah tervalidasi (OLC-021). Jangan membuat file laporan tandingan.
3. Setiap klaim temuan harus punya bukti: path file + baris, output perintah, atau kutipan config. Tanpa bukti = pertanyaan terbuka, bukan temuan.
4. Revisi tidak menghapus penalaran penting: revisi ditambahkan sebagai bagian baru bertanggal di laporan yang sama; alasan perubahan pendekatan harus tercatat.

## Alur

1. Validasi identitas proyek dan baca `project_id` dari `.olc/config.json` (jangan operasi vault sebelum ini lolos).
2. Baca request user + konteks relevan secukupnya (index/current-state vault bila ada, file app terkait). Jangan membaca seluruh vault.
3. Tulis laporan via template `explore-report` (var: `task_id`, `project_id`, `date`, `request`, `findings`, `options`, `recommendation`). Buat direktori `explore/` bila belum ada; jangan menimpa laporan yang sudah dikustom tanpa persetujuan (ikuti aturan create-only OLC-023).
4. Bila request berubah atau temuan baru muncul: tambah bagian revisi bertanggal di laporan yang sama, catat alasan di `history.md` task.
5. Serahkan ke Plan: laporan explore adalah input `draftTaskDocs`, bukan pengganti `intent.md`/`plan.md`. Tanpa kedua dokumen itu disetujui, tidak ada coding (OLC-032).

## Verifikasi skill ini

- Setelah Explore: `git status --short` di repo app harus bersih (tidak ada perubahan app).
- Laporan ada di path yang benar dan semua var template terisi (tidak ada `{{...}}` tersisa).
