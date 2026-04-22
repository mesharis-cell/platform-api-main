# Evidence Pack — Kadence Issues response

For the three items raised on 22 Apr 2026.

---

## 1. PJ White Bar Large — photo has not been altered

**Claim:** The photo currently displayed is the same image file we received at data migration on 25 Feb 2026. It has not been edited since.

**Evidence:**

- `pj-white-bar-image-1-s3-metadata.json` — AWS S3 object metadata for image #1. `LastModified` = **2026-02-25T03:51:49Z**.
- `pj-white-bar-image-2-s3-metadata.json` — AWS S3 object metadata for image #2. `LastModified` = **2026-02-25T03:51:49Z**.
- `pj-white-bar-current-image-1.jpg` / `-2.jpg` — the actual image files currently shown on the asset, downloaded directly from storage.
- `pj-white-bar-image-download-links.txt` — time-limited direct links to view the files from source (valid 7 days).

The `LastModified` field is set by AWS at upload time and cannot be changed without re-uploading the file — which would also change the ETag. The ETag in the metadata matches across reads, confirming the file has been untouched for ~8 weeks.

---

## 2. Absolut New White Back Bar — all 11 units are in the system

**Claim:** All 11 units exist, are active, and are not deleted. They are viewable inside the family detail page.

**Evidence:**

- `absolut-white-back-bar-11-units.csv` — full list of all 11 units pulled from the database, with QR codes, status, and creation dates. Zero are deleted.

Unit #1 was part of the initial data migration (25 Feb). Units #2–#11 were added on 14 Apr via the Add Units flow.

---

## 3. Missing reports — no submissions on record

No file artifact applies here — the evidence is the **absence** of submissions. If specific report instances can be named (which asset, approximately when), each can be traced individually.

---

## Verifying the photo evidence yourself

To independently check image #1's `LastModified`, anyone with AWS CLI access to the `pmg-afs-bucket` can run:

```
aws s3api head-object \
  --bucket pmg-afs-bucket \
  --key "assets/pr-import/4b54fdee26d08b5b1a7e701f789d113d22a39267191d8bc2e98e805adf2c0bc9.jpg"
```

The `LastModified` field in the response is the authoritative upload timestamp.
