---
name: olc-taste
description: Pelajari preferensi khas proyek tanpa mengubah perilaku diam-diam. Sinyal berulang jadi usulan pending; hanya persetujuan user yang mengaktifkan.
---

# olc-taste

Selera proyek dipelajari tanpa silent behavior change: sinyal berulang dicatat sebagai proposal `pending` lengkap dengan contoh/bukti, dan hanya keputusan user eksplisit yang mengubahnya jadi `active`. Penolakan memarkirnya sebagai `rejected` (riwayat, tidak pernah dipakai). Rule `pending` tidak pernah diperlakukan sebagai aktif oleh konsumen mana pun.

## Aturan keras

1. **Hanya user yang mengaktifkan.** Tidak ada jalur otomatis pending→active. Review terminal: `active`/`rejected` tidak bisa di-review ulang (`BAD_TRANSITION`).
2. **Scope satu proyek.** Semua path di dalam `taste/` proyek tervalidasi; proyek lain tidak tersentuh. Modul ini tidak pernah menyentuh `tasks/` — intent/plan yang disetujui tidak bisa tertimpa dari sini.
3. **Usulan butuh bukti.** Tanpa ≥1 contoh/sinyal berulang, usulan ditolak langsung (`INVALID_INPUT`). Duplikat tidak digabung diam-diam (`ALREADY_EXISTS`).

## Alur

1. Usulkan: `proposeTasteRule({ projectRoot, config, name, rule, examples[] })` → `taste/<name>.md` status `pending` via template `taste-rule`, write atomik create-only.
2. Baca: `getTasteRule(...)` / `listTasteRules({ status? })` — hanya di scope tervalidasi, urut nama.
3. Review eksplisit bersama user: `reviewTasteRule({ projectRoot, config, name, approve })` — `true` = pending→active, `false` = pending→rejected. Nama tak dikenal → `UNKNOWN_RULE`.

## Verifikasi skill ini

- Rule `pending` tidak muncul di daftar `active`.
- `approve` mengaktifkan, `reject` memarkir; review ulang status terminal gagal.
- Intent/plan task byte-identik sebelum dan sesudah siklus propose→review.
