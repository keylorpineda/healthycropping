# HealthyCrop — Model Cards

This document provides the Model Cards (following Mitchell et al., 2019) for the three on-device TensorFlow Lite crop disease classification models shipped with **HealthyCrop**.

> [!WARNING]
> **Agronomic Decision-Support Disclaimer**: These models are intended solely for preliminary field decision support in Costa Rica and comparable tropical agroecosystems. They **do not replace a certified agronomist** or laboratory phytosanitary diagnosis. Visual symptoms of fungal, bacterial, viral, pest, and nutritional disorders can overlap. Never apply restricted agrochemicals or eradicate trees based solely on an automated prediction.

---

## 1. Shared Architecture & Export Specification

- **Developer / Author**: Keylor Pineda (`@keylorpineda`)
- **Backbone Architecture**: `MobileNetV3-Large` pretrained on ImageNet-1K (`include_top=False`), global average pooling, dropout, and crop-specific classification head.
- **Training Strategy**:
  1. **Stage 1 (Baseline / Head Warm-up)**: Freeze `MobileNetV3-Large` backbone; train classification head with class weights and online data augmentation (random horizontal/vertical flips, rotation, brightness/contrast jitter, crop/zoom).
  2. **Stage 2 (Fine-Tuning)**: Unfreeze top feature-extraction blocks at a reduced learning rate with early stopping monitored on **validation macro-F1**.
- **Input Specification**: `224 x 224 x 3` RGB tensor, EXIF-transposed before resize, normalized identically in Python (`ml/`) and React Native (`app/src/ml/`).
- **Export Target**: Float16 quantized `.tflite` (`< 10 MB` per model), verified within `<= 1.0` percentage point of Keras test accuracy.
- **Abstention / Low-Confidence Handling**: Each model defines a calibrated confidence threshold in `ml/models/<crop>/registry.json` selected on the validation split. Predictions below this threshold trigger the UI warning `"low confidence — retake the photo"` rather than an actionable diagnosis.

---

## 2. Coffee Leaf Model (`coffee`)

### 2.1 Overview
- **Model Identifier**: `coffee-v0.1.0` (training run `coffee-v0.1.0-finetuned`, `2026-10-16`)
- **Model File**: `coffee_v0.1.0_fp16.tflite` (`6,061,508` bytes, float16 weights, float32 I/O), attached to GitHub Releases (never committed)
- **Registry File**: [`ml/models/coffee/registry.json`](../ml/models/coffee/registry.json) (labels, input spec, normalization, confidence threshold, SHA-256, metrics)
- **Target Plant Organ**: Coffee leaf (*Coffea arabica* and *Coffea canephora*), one leaf filling most of the frame, underside preferred for early orange rust urediniospore detection.
- **Classes** (output order):
  1. `healthy`
  2. `leaf_rust` (*Hemileia vastatrix*)
  3. `leaf_miner` (*Leucoptera coffeella*)
  4. `cercospora` (*Cercospora coffeicola* / iron spot)
  5. `brown_leaf_spot` (*Phoma* / *Ascochyta* spp.)
  6. `red_spider_mite` (*Oligonychus yothersi*)
- **Severity**: `v0.1.0` predicts the class only. Rust severity labels (RoCoLe levels 1–4, BRACOL severity) are kept in the manifest for a later severity head; the app does not display a severity estimate yet.

### 2.2 Intended Use
- **Intended users**: Smallholder coffee farmers and extension workers in Costa Rica checking a suspicious leaf in the field, offline.
- **Intended use**: Preliminary triage that suggests the most likely visible condition and prompts consulting an agronomist or extension service before any treatment.
- **Out of scope**: Lab-grade diagnosis, treatment prescription, whole-plant or plot-level assessment, non-coffee plants, berries, stems, or roots.

### 2.3 Training & Evaluation Data
- **Sources**: RoCoLe (Mendeley DOI `10.17632/c5yvn32dzg.2`, Robusta field photos, CC BY 4.0) and the BRACOL whole-leaf subset (Mendeley DOI `10.17632/yy2k5y8mxg.1`, Arabica, CC BY 4.0). See [`docs/data_reports/coffee.md`](data_reports/coffee.md).
- **Preparation**: EXIF orientation fix, RGB, `224x224` bilinear resize, `imagehash.phash` deduplication (`78` cross-plant duplicates removed), `2,824` images total.
- **Split**: `70%` train (`1,969`) / `15%` validation (`426`) / `15%` test (`429`), grouped by plant (`group_id`), stratified by class (`seed=42`), zero group overlap across splits.
- **Preprocessing contract**: `normalized = (rgb - 127.5) / 127.5` (range `[-1, 1]`), NHWC float32. Parity with the app is enforced by [`ml/fixtures/preprocessing_fixture_224.json`](../ml/fixtures/preprocessing_fixture_224.json).

### 2.4 Quantitative Performance (held-out test split, `n = 429`)

| Metric | Keras Test Set | Float16 TFLite Test Set | Delta | Target |
| :--- | :--- | :--- | :--- | :--- |
| **Macro-F1 (6 classes)** | `0.7290` | `0.7222` | `-0.0068` | `>= 0.80` (not met, see §2.6) |
| **Mean F1 (4 major classes, `89.7%` of test)** | `0.8582` | `0.8556` | `-0.0026` | — |
| **Accuracy** | `81.35%` | `81.12%` | `-0.23 pp` | Within `1 pp` ✅ |
| **Keras / TFLite top-1 agreement** | — | `99.77%` | — | — |
| **Model Size** | `12.7 MB` (`.keras`) | `6.06 MB` | — | `< 10 MB` ✅ |
| **Confidence Threshold** | — | `0.79` | — | Validation-calibrated ✅ |

**Per-class float16 TFLite test metrics:**

| Class | Precision | Recall | F1 | Support | Coverage at threshold `0.79` |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `healthy` | `0.8428` | `0.9437` | `0.8904` | `142` | `74.6%` |
| `leaf_rust` | `0.8273` | `0.7516` | `0.7877` | `153` | `66.0%` |
| `leaf_miner` | `0.7838` | `0.7632` | `0.7733` | `38` | `78.9%` |
| `cercospora` | `0.4138` | `0.6000` | `0.4898` | `20` | `55.0%` |
| `brown_leaf_spot` | `0.9804` | `0.9615` | `0.9709` | `52` | `98.1%` |
| `red_spider_mite` | `0.5714` | `0.3333` | `0.4211` | `24` | `41.7%` |

**Abstention**: the threshold is the lowest top-1 probability that keeps validation precision at `>= 90%` on accepted predictions (`90.9%` precision, `69.5%` coverage). On the test split, it gives `87.7%` precision at `72.0%` coverage. Below the threshold, the app shows "low confidence — retake the photo" instead of a diagnosis. The weakest classes (`red_spider_mite`, `cercospora`) are also the most often abstained on.

### 2.5 Interpretability (Grad-CAM)
- Per-class Grad-CAM grid: [`docs/assets/gradcam/coffee_gradcam.png`](assets/gradcam/coffee_gradcam.png). Correct predictions focus on lesions, pustules, and mines rather than background; full analysis in [`docs/EXPERIMENTS.md`](EXPERIMENTS.md#4-grad-cam-visual-explanations-phase-2).

### 2.6 Coffee-Specific Limitations
1. **Macro-F1 target not met (`0.72` vs `0.80`)**: driven by two small classes. `red_spider_mite` stippling blurs into early rust chlorosis at `224x224` (`13/24` test images predicted as `leaf_rust`); `cercospora` has only `96` training and `20` test images, and is often confused with `leaf_rust` (`11/153` rust images predicted as cercospora).
2. **Species/site bias**: RoCoLe is Robusta from a single region and BRACOL is Arabica from Brazil; no Costa Rican images were used for training. Field validation in Costa Rica is planned for `v1.0.0` (`docs/FIELD_VALIDATION.md`).
3. **Single label**: co-infections (e.g. rust + leaf miner) are reduced to the dominant visible pattern.
4. **Severity** is not estimated in `v0.1.0` (see §2.1).

---

## 3. Cacao Pod Model (`cacao`)

### 3.1 Overview
- **Model Identifier**: `cacao-v1.0.0` *(populated in Phase 5)*
- **Registry File**: `ml/models/cacao/registry.json`
- **Target Plant Organ**: Cacao pod / fruit (*Theobroma cacao*) attached to tree or freshly harvested.
- **Classes**:
  1. `healthy` (`h0`)
  2. `monilia` (*Moniliophthora roreri*, frost/internal rot stages `m1`, `m2`, `m3`)
  3. `black_pod` (*Phytophthora palmivora* / *P. capsici*)

### 3.2 Training & Evaluation Data
- **Sources**: CocoaMoniliaDataSet (Zenodo DOI `10.5281/zenodo.17156051`) and UNAB cocoa diseases (Kaggle `serranosebas/enfermedades-cacao-yolov4`, cropped per labeled pod).
- **Split**: `70%` train / `15%` validation / `15%` test, grouped by parent photograph/pod (`group_id`), stratified by class (`seed=42`).

### 3.3 Quantitative Performance *(Populated in Phase 5)*

| Metric | Keras Test Set | Float16 TFLite Test Set | Delta | Target |
| :--- | :--- | :--- | :--- | :--- |
| **Macro-F1** | *TBD (Phase 5)* | *TBD (Phase 5)* | *TBD* | `>= 0.80` |
| **Accuracy** | *TBD (Phase 5)* | *TBD (Phase 5)* | `<= 1.0 pp` | Within `1 pp` |
| **Model Size** | — | *TBD (Phase 5)* | — | `< 10 MB` |
| **Confidence Threshold** | — | *TBD (Phase 5)* | — | Validation-calibrated |

### 3.4 Interpretability (Grad-CAM)
- Representative Grad-CAM heatmaps per class (`docs/assets/gradcam/cacao_*.png`) are generated in Phase 5.

---

## 4. Banana Leaf Model (`banana`)

### 4.1 Overview
- **Model Identifier**: `banana-v1.0.0` *(populated in Phase 5)*
- **Registry File**: `ml/models/banana/registry.json`
- **Target Plant Organ**: Banana leaf (*Musa* spp.).
- **Classes**:
  1. `healthy`
  2. `black_sigatoka` (*Pseudocercospora fijiensis* / *Mycosphaerella fijiensis*)
  3. `fusarium_wilt` (*Fusarium oxysporum* f. sp. *cubense*)

### 4.2 Training & Evaluation Data
- **Sources**: Banana Leaves Imagery (NM-AIST DSpace `20.500.12479/3003`, DOI `10.1038/s41597-025-04456-4`) and mapped classes from BananaLSD (Mendeley `9tb7k297ff`).
- **Split**: `70%` train / `15%` validation / `15%` test, grouped by `group_id`, stratified by class (`seed=42`).

### 4.3 Quantitative Performance *(Populated in Phase 5)*

| Metric | Keras Test Set | Float16 TFLite Test Set | Delta | Target |
| :--- | :--- | :--- | :--- | :--- |
| **Macro-F1** | *TBD (Phase 5)* | *TBD (Phase 5)* | *TBD* | `>= 0.80` |
| **Accuracy** | *TBD (Phase 5)* | *TBD (Phase 5)* | `<= 1.0 pp` | Within `1 pp` |
| **Model Size** | — | *TBD (Phase 5)* | — | `< 10 MB` |
| **Confidence Threshold** | — | *TBD (Phase 5)* | — | Validation-calibrated |

### 4.4 Interpretability (Grad-CAM)
- Representative Grad-CAM heatmaps per class (`docs/assets/gradcam/banana_*.png`) are generated in Phase 5.

---

## 5. Known Limitations & Out-of-Scope Inputs

1. **Out-of-Distribution Inputs**: Scanning non-plant objects, stems/roots, unsupported crops, or multiple overlapping leaves degrades confidence and may trigger false positives if above the confidence threshold.
2. **Illumination & Moisture**: Specular glare from wet leaves/pods after tropical rain or harsh midday shadows can obscure chlorotic halos or early spore pustules.
3. **Co-Infections & Nutrient Deficiencies**: A single leaf may exhibit both fungal infection (e.g., *Cercospora*) and micronutrient deficiency (nitrogen/magnesium chlorosis); single-label classification predicts the dominant visual pattern.
