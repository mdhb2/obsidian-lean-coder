---
name: olc-log
description: Catat event penting, checkpoint, dan ringkasan sesi ke log aktivitas harian yang tahan lama. Terverifikasi anti rusak dan anti bocor rahasia.
---

# olc-log

Log aktivitas abadi per proyek di `<vault>/OLC/Projects/<project_id>/logs/YYYY-MM-DD.md` (satu file per hari — itulah rotasinya, tanpa rotasi ukuran untuk MVP).

## Aturan keras

1. **Hanya event eksplisit.** Modul tidak hook ke tool call — tidak ada noise per-tool-call secara konstruksi. Catat hanya milestone, checkpoint, verifikasi, dan ringkasan sesi.
2. **Rahasia disensor, tidak disimpan.** Pola kredensial yang dikenal di summary/details diganti `[redacted]` dan entri ditandai.
3. **Append aman.** Satu write `O_APPEND` per entri; interupsi tidak pernah merusak entri sebelumnya. File tanpa newline akhir (sisa crash) dinormalisasi sebelum append berikutnya.
4. **Identitas dulu.** Vault salah → throw dengan nol file dibuat.

## Alur

1. Tulis: `logEvent({ projectRoot, config, event: { kind, summary, taskId?, details?, gitSha?, date? } })` — `kind` mis. `milestone|checkpoint|verify|session`; `summary` non-kosong wajib.
2. Baca: `readLogDay(vaultRoot, projectId, day)` atau `readLastEvents(vaultRoot, projectId, limit)` (urutan terbaru dulu — verifikasi terakhir terlihat di sana).
3. Akhir sesi normal: panggil `buildSessionSummary` (modul `session`) — teks Indonesia via template `session-summary` + footer jujur hard-kill, klaim faktual hanya dari `VerifyOutcome`/SHA/checkpoint nyata — lalu tampilkan ke user. Sesi yang mati mendadak tidak menghasilkan ringkasan; event log terakhir adalah titik pemulihan (lihat resume).

## Verifikasi skill ini

- Rahasia pola `sk-...`, `ghp_...`, `AKIA...` di summary tidak pernah sampai ke vault (jadi `[redacted]`).
- Interupsi di tengah append tidak merusak entri sebelumnya.
