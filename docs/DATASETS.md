# HealthyCropping — Datasets, Licensing & Data Governance

This document tracks all external datasets used to train and evaluate the **HealthyCropping** models (`ml/`), their licensing terms, academic citations, taxonomy mappings, and leakage-prevention rules.

> [!IMPORTANT]
> **License Gate Policy**: Before downloading or processing any dataset in Phases 1 and 5, the download script and engineer must inspect the upstream license file (`license.txt` or repository metadata). If any dataset license is missing, ambiguous, or incompatible with open-source non-commercial research/educational model training, work stops immediately to consult the project owner. Raw and processed images (`ml/data/`) are never committed to Git or redistributed in GitHub Releases.

---

## 1. Dataset Registry

| Dataset | Crop | Plant Part | Upstream Source / Identifier | Upstream Classes Used | License (Verified in Phase 1 / 5) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RoCoLe** | Coffee (*Coffea canephora*) | Leaf (field photos, upper/underside) | Mendeley Data, DOI: [`10.17632/c5yvn32dzg.2`](https://doi.org/10.17632/c5yvn32dzg.2) | Healthy, Rust (levels 1–4), Red spider mite (1,560 `.jpg` images + annotations) | **CC BY 4.0** (Verified via Mendeley API, [`creativecommons.org/licenses/by/4.0`](http://creativecommons.org/licenses/by/4.0)) |
| **BRACOL** | Coffee (*Coffea arabica*) | Whole leaf only (exclude cropped symptom patches) | Mendeley Data: `yy2k5y8mxg` ([`10.17632/yy2k5y8mxg.1`](https://doi.org/10.17632/yy2k5y8mxg.1)) | Healthy, Leaf miner, Rust, Brown leaf spot, Cercospora + severity labels (`BRACOL_coffee_leaf_ images_datasets.zip`, SHA-256 `25a2fc97...fdfc1f`) | **CC BY 4.0** (Verified via Mendeley API, [`creativecommons.org/licenses/by/4.0`](http://creativecommons.org/licenses/by/4.0)) |
| **CocoaMoniliaDataSet** | Cacao (*Theobroma cacao*) | Pod (fruit) | Zenodo, DOI: [`10.5281/zenodo.17156051`](https://doi.org/10.5281/zenodo.17156051) | Healthy (`h0`), Monilia stages (`m1`, `m2`, `m3`) | **CC BY 4.0** (Verified via Zenodo API, Alvarado Molina et al., [`creativecommons.org/licenses/by/4.0`](http://creativecommons.org/licenses/by/4.0)) |
| **UNAB Cocoa Diseases** | Cacao (*Theobroma cacao*) | Pod (cropped from YOLOv4 bounding boxes) | Kaggle: `serranosebas/enfermedades-cacao-yolov4` | Healthy, Monilia, Black pod (*Phytophthora*) | **ODbL v1.0 / © Original Authors** (Verified via Kaggle metadata, Heredia Gómez & Serrano, UNAB, [`opendatacommons.org/licenses/odbl/1.0`](https://opendatacommons.org/licenses/odbl/1.0/)) |
| **Banana Leaves Imagery** (*Banana Imagery Dataset - Tanzania*) | Banana (*Musa* spp.) | Leaf (field photos) | Zenodo, DOI: [`10.5281/zenodo.7670326`](https://doi.org/10.5281/zenodo.7670326) (also NM-AIST DSpace [`20.500.12479/3003`](https://dspace.nm-aist.ac.tz/handle/20.500.12479/3003); article DOI [`10.1038/s41597-025-04456-4`](https://doi.org/10.1038/s41597-025-04456-4)) | Healthy (`HEALTHY-1.zip`), Black Sigatoka (`BLACK SIGATOKA-2.zip`), Fusarium wilt (`FUSARIUM WILT-1.zip`); first 300 / 150 / 300 images (archive order) extracted via HTTP Range | **CC BY 4.0** (Verified via Zenodo API `license.id = cc-by-4.0`, Mduma & Elinisa, [`creativecommons.org/licenses/by/4.0`](http://creativecommons.org/licenses/by/4.0)) |
| **BananaLSD** | Banana (*Musa* spp.) | Leaf | Mendeley Data: `9tb7k297ff` ([`10.17632/9tb7k297ff.1`](https://doi.org/10.17632/9tb7k297ff.1)) | `OriginalSet` only: `healthy` -> `healthy`, `sigatoka` -> `black_sigatoka` (archive MD5 `4d55d992...682c36`) | **CC BY 4.0** (Verified via Mendeley API, [`creativecommons.org/licenses/by/4.0`](http://creativecommons.org/licenses/by/4.0)) |

---

## 2. Target Taxonomies & Special Handling Rules

### 2.1 Coffee (`ml/configs/coffee.yaml`)
- **Classes**: `healthy`, `leaf_rust` (with severity metadata), `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite`.
- **RoCoLe Grouping**: RoCoLe contains ~4 photos per plant taken under varying orientations. All images from the same plant are assigned the same `group_id` so they never cross train/val/test boundaries.
- **BRACOL Filtering**: BRACOL includes both full-leaf images (`leaf/`) and isolated symptom lesion crops (`symptom/`). Only whole-leaf images are ingested so the input distribution matches smartphone photos captured in the field.

### 2.2 Cacao (`ml/configs/cacao.yaml`)
- **Classes**: `healthy`, `monilia` (with stage metadata `m1`, `m2`, `m3`), `black_pod` (*Phytophthora*).
- **UNAB Bounding-Box Cropping**: The UNAB dataset is annotated in YOLO object-detection format. `ml/scripts/prepare_cacao.py` parses each label file, crops each labeled pod with a configurable context margin, and assigns `group_id = source_image_stem` so multiple pods cropped from the same photograph stay in the same split.

### 2.3 Banana (`ml/configs/banana.yaml`)
- **Classes**: `healthy`, `black_sigatoka`, `fusarium_wilt`.
- **BananaLSD Filtering**: Only `OriginalSet/` is ingested. `AugmentedSet/` holds synthetic augmentations of the same photos and would leak across splits, so it is excluded entirely. `healthy` maps to `healthy` and `sigatoka` to `black_sigatoka`; `cordana` and `pestalotiopsis` are outside the taxonomy and counted as `skipped_unmapped` in `docs/data_reports/banana.md`.
- **NM-AIST Range Extraction**: The Zenodo record ships nine 2-7 GB ZIP archives. `ml/scripts/download_banana_nmaist.py` reads each archive's Central Directory with HTTP `Range` requests and extracts the first `max_images` entries (archive order) in contiguous, CRC-32-verified batches, throttled for Zenodo's rate limit.
- **NM-AIST Grouping**: No plant IDs are published; photos are numbered per capture session, so blocks of 10 consecutive numbers share one `group_id` to keep near-identical shots of the same plant in a single split.
- **Source/Class Confounding**: `fusarium_wilt` only exists in NM-AIST, so NM-AIST `healthy` and `black_sigatoka` images are also ingested to keep the model from learning the source instead of the disease.

---

## 3. Data Hygiene & Zero-Leakage Protocol

Every `ml/scripts/prepare_<crop>.py` script enforces the following steps:
1. **Integrity & Orientation**: Verify file readability via `Pillow`, apply `ImageOps.exif_transpose` to fix phone rotation metadata, and convert to 3-channel `RGB`. Drop corrupt or unreadable files and log counts.
2. **Cross-Source Near-Duplicate Removal**: Compute perceptual hashes (`imagehash.phash`) across all ingested images for a crop. Pairs within the configured Hamming distance threshold are deduplicated before splitting, keeping a single canonical sample and logging all removed duplicates in `docs/data_reports/<crop>.md`.
3. **Grouped Stratified Splitting (`70 / 15 / 15`, `seed = 42`)**:
   - Split into `train` (70%), `val` (15%), and `test` (15%) using `seed=42`.
   - Grouping by `group_id` (plant ID or multi-box parent image) guarantees `len(set(train.group_id) & set(val.group_id)) == 0` and `len(set(train.group_id) & set(test.group_id)) == 0`.
   - Stratification preserves class proportions across splits.
4. **Small-Class Rule**: Any class with `< 50` training images after deduplication and splitting is evaluated for merging or exclusion, with the rationale recorded in `docs/data_reports/<crop>.md`.
5. **Manifest Schema**: Outputs `ml/data/processed/<crop>/manifest.csv` with columns:
   ```csv
   path,label,severity,source,group_id,split
   ```

---

## 4. Citations

- **RoCoLe**: Parraga-Alava, J., Cusme, K., Loor, A., & Santander, E. (2019). *RoCoLe: A robusta coffee leaf images dataset for evaluation of machine learning based methods in plant diseases recognition*. Mendeley Data, V2. `https://doi.org/10.17632/c5yvn32dzg.2`
- **BRACOL**: Krohling, R. A., Esgario, J. G. M., & Ventura, J. A. (2019). *BRACOL - A Brazilian Arabica Coffee Leaf images dataset to identification and quantification of coffee diseases and pests*. Mendeley Data, V1. `https://doi.org/10.17632/yy2k5y8mxg.1`
- **CocoaMoniliaDataSet**: Alvarado Molina, J. F., Restrepo-Arias, J. F., Velásquez, D., Branch Bedoya, J. W., & Maiza, M. (2025). *CocoaMoniliaDataSet*. Zenodo. `https://doi.org/10.5281/zenodo.17156051` / `https://doi.org/10.5281/zenodo.17716661` (CC BY 4.0).
- **UNAB Cocoa Diseases**: Heredia Gómez, J. F., & Serrano, S. (2020). *Cocoa Diseases (YOLOv4)* / *Enfermedades Cacao YOLOv4*. Universidad Autónoma de Bucaramanga (UNAB). Kaggle Dataset `serranosebas/enfermedades-cacao-yolov4` (ODbL v1.0 / © Original Authors).
- **Banana Leaves Imagery**: Mduma, N., & Elinisa, C. (2023). *Banana Imagery Dataset - Tanzania*. Zenodo. `https://doi.org/10.5281/zenodo.7670326` (CC BY 4.0). Data descriptor: *Scientific Data* (2025), `https://doi.org/10.1038/s41597-025-04456-4`.
- **BananaLSD**: Arman, S. E., Bhuiyan, M. A. B., Abdullah, H. M., Islam, S., Chowdhury, T. T., & Hossain, M. A. (2023). *Banana Leaf Spot Diseases (BananaLSD) Dataset for Classification of Banana Leaf Diseases Using Machine Learning*. Mendeley Data, V1. `https://doi.org/10.17632/9tb7k297ff.1` (CC BY 4.0).
