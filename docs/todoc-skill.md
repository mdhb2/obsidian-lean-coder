# OLC-ToDoc — Skill Specification

**Skill Name:** `olc-todoc`
**Version:** 0.1.0
**Type:** Standalone Agent Skill
**Output:** Markdown (`.md`)

## 1. Purpose

`olc-todoc` adalah skill untuk menuliskan informasi, permintaan, atau konteks percakapan menjadi dokumen Markdown yang dapat disimpan, dibaca kembali, dan digunakan sebagai referensi di kemudian hari.

Skill ini menggabungkan dua tujuan:

- **Documentation:** menuliskan informasi dengan jelas, terstruktur, dan sesuai dengan tujuan dokumen.
- **Context preservation:** mempertahankan konteks, keputusan, alasan, dan informasi penting dari percakapan agar tidak hilang dan dapat digunakan kembali.

Skill tidak terbatas pada dokumentasi proyek atau pekerjaan. Kontennya dapat berupa apa pun yang diminta user untuk ditulis ke dalam file.

## 2. Core Principles

- **Content-first:** struktur dokumen mengikuti isi dan tujuan penulisan, bukan template yang kaku.
- **Faithful:** pertahankan maksud dan informasi penting dari sumber.
- **Reusable:** hasil harus mudah dipahami ketika dibaca kembali tanpa harus membuka percakapan asal.
- **Clear structure:** gunakan judul, heading, daftar, tabel, kode, atau format lain sesuai kebutuhan.
- **No fabrication:** jangan mengarang informasi yang tidak tersedia atau mengubah asumsi menjadi fakta.
- **Standalone:** tidak bergantung pada framework, repository, atau skill lain.
- **User-controlled storage:** pastikan nama file dan lokasi penyimpanan sebelum membuat file jika belum ditentukan user.

## 3. Workflow

### Step 1 — Understand the Request

Pahami apa yang ingin dituliskan user, sumber informasinya, serta tujuan penggunaan dokumen.

Sumber dapat berupa:

- Konteks percakapan AI.
- Informasi yang diberikan langsung oleh user.
- Hasil diskusi atau keputusan.
- Penjelasan, catatan, referensi, atau dokumentasi yang diminta.
- Materi dari sumber eksternal yang dapat diakses.

Jangan menanyakan apakah user menginginkan dokumentasi atau handoff. Tentukan pendekatan berdasarkan isi dan tujuan permintaan.

### Step 2 — Prepare the Content

Susun konten agar runtut, jelas, dan mudah digunakan kembali.

- Pertahankan substansi dan detail penting.
- Hilangkan pengulangan yang tidak diperlukan tanpa kehilangan makna.
- Gunakan istilah dan format yang sesuai dengan topik.
- Sertakan konteks yang diperlukan agar dokumen tetap dapat dipahami secara mandiri.
- Jika bersumber dari percakapan AI, ambil informasi yang relevan, bukan sekadar menyalin seluruh percakapan.
- Jika user meminta penulisan dengan format atau struktur tertentu, ikuti permintaan tersebut.

Jangan otomatis menambahkan bagian status pekerjaan, blocker, atau next steps jika tidak relevan.

### Step 3 — Recommend the Filename

Tentukan rekomendasi nama file berdasarkan isi dan tujuan dokumen.

Ketentuan:

- Gunakan nama yang deskriptif, singkat, lowercase, dan `kebab-case`.
- Gunakan ekstensi `.md`.
- Hindari nama generik seperti `notes.md` atau `document.md`.
- Jika user sudah menentukan nama file, gunakan nama tersebut.
- Jika nama belum ditentukan, rekomendasikan nama berdasarkan ringkasan konten dan minta konfirmasi atau pilihan user.

### Step 4 — Confirm the Storage Location

- Jika lokasi belum disebutkan, tanyakan lokasi penyimpanan yang diinginkan.
- Jika nama file dan lokasi belum disebutkan, tanyakan keduanya sekaligus sambil memberikan rekomendasi nama file.
- Jika hanya salah satunya belum ditentukan, tanyakan hanya informasi yang masih diperlukan.
- Jangan mengasumsikan direktori kerja, folder `docs/`, atau lokasi lainnya sebagai tujuan tanpa persetujuan user.

### Step 5 — Create or Update the File

Setelah nama file dan lokasi ditentukan, tulis konten ke dalam file Markdown.

Jika file terkait sudah ada dan dapat diakses:

- Periksa konten yang sudah ada.
- Tentukan apakah informasi perlu ditambahkan, diperbarui, atau disimpan sebagai dokumen baru.
- Pertahankan informasi lama yang masih relevan.
- Hindari duplikasi dan overwrite yang tidak disengaja.

Jika user meminta format khusus, ikuti format tersebut selama sesuai dengan tujuan file.

### Step 6 — Validate and Report

Pastikan konten sesuai dengan permintaan, struktur mudah dibaca, dan informasi penting tidak hilang.

Setelah operasi file, laporkan lokasi file serta ringkasan singkat isi dan perubahan yang dilakukan. Jangan mengklaim file berhasil dibuat atau diperbarui jika operasi tersebut gagal.

## 4. Document Structure

**Tidak ada template universal yang wajib digunakan.**

Susunan dokumen harus ditentukan oleh jenis konten dan tujuan penggunaannya.

Contoh pendekatan:

| Jenis konten          | Struktur yang sesuai                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Catatan pengetahuan   | Judul, penjelasan, konsep penting, contoh                                                     |
| Konteks percakapan AI | Latar belakang, konteks penting, hasil diskusi, keputusan, informasi yang perlu dipertahankan |
| Dokumentasi teknis    | Overview, komponen, konfigurasi, cara penggunaan, referensi                                   |
| Hasil riset           | Pertanyaan, temuan, sumber, analisis, kesimpulan                                              |
| Tutorial              | Tujuan, prasyarat, langkah, contoh, verifikasi                                                |
| Keputusan             | Konteks, keputusan, alasan, konsekuensi                                                       |
| Handoff pekerjaan     | Tujuan, kondisi saat ini, progres, kendala, artefak terkait, langkah berikutnya               |
| Konten bebas          | Format yang paling sesuai dengan permintaan user                                              |

Tabel ini merupakan panduan, bukan daftar mode yang harus dipilih user.

Gunakan heading hanya jika membantu mengorganisasi isi. Dokumen pendek dapat cukup berupa judul dan beberapa paragraf. Dokumen teknis yang kompleks dapat memiliki banyak bagian.

Jika dokumen berfungsi sebagai referensi sekaligus handoff, gabungkan informasi yang diperlukan secara alami tanpa memaksakan seluruh bagian dari template handoff.

## 5. Information Integrity

- Bedakan fakta, keputusan, usulan, asumsi, dan hal yang belum diketahui jika perbedaannya penting.
- Jangan mengubah hasil diskusi menjadi keputusan final tanpa dasar.
- Pertahankan batasan dan konteks yang memengaruhi makna informasi.
- Cantumkan referensi untuk sumber eksternal yang benar-benar digunakan.
- Jangan mengarang sumber, hasil verifikasi, atau detail yang tidak tersedia.
- Hindari memasukkan kredensial atau informasi sensitif yang tidak diperlukan.
- Jangan mengklaim file telah dibaca, diverifikasi, atau disimpan jika belum dilakukan.

## 6. Acceptance Criteria

- [ ] Dapat menuliskan berbagai jenis informasi ke dokumen Markdown.
- [ ] Dapat mengambil konteks relevan dari percakapan AI dan mempertahankannya untuk penggunaan selanjutnya.
- [ ] Tidak memaksakan struktur handoff atau template task pada dokumen umum.
- [ ] Memilih struktur berdasarkan isi dan tujuan dokumen tanpa meminta user memilih jenis dokumen.
- [ ] Merekomendasikan nama file berdasarkan isi yang telah disusun.
- [ ] Meminta lokasi dan/atau nama file yang belum ditentukan.
- [ ] Tidak membuat file sebelum informasi penyimpanan yang diperlukan tersedia.
- [ ] Memeriksa file yang sudah ada sebelum memperbarui atau membuat duplikat jika akses tersedia.
- [ ] Menghasilkan konten yang akurat, runtut, mudah dibaca, dan dapat dipahami secara mandiri.
- [ ] Melaporkan hasil penyimpanan secara akurat.

## 7. Definition of Done

`olc-todoc` siap digunakan ketika mampu mengubah informasi atau konteks percakapan menjadi dokumen Markdown yang sesuai dengan tujuan penulisan, menentukan struktur secara adaptif, merekomendasikan nama file, memastikan lokasi penyimpanan, dan menghasilkan dokumen yang berguna sebagai referensi di kemudian hari.

**Prinsip utama:** tuliskan apa yang diminta user, pertahankan maknanya, susun sesuai kebutuhan konten, dan simpan sebagai dokumen yang mudah digunakan kembali.
