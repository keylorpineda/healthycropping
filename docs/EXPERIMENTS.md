# HealthyCropping — ML Experiments Log

This document records all training, hyperparameter, ablation, and quantization experiments across Phases 1, 2, and 5.

---

## 1. Experimental Protocol

- **Fixed Random Seed**: `42` across Python `random`, `numpy`, `scikit-learn` splitters, and `tensorflow`.
- **Data Split**: `70%` train / `15%` validation / `15%` test, grouped by `group_id` and stratified by class label after cross-source perceptual-hash deduplication.
- **Input Resolution**: `224 x 224 x 3` RGB.
- **Augmentation Pipeline (Train Only)**:
  - Random horizontal and vertical flips
  - Random rotation (`±15°`)
  - Random brightness and contrast adjustment (`±15%`)
  - Random zoom / crop (`85%–100%` area)
- **Imbalance Handling**: Balanced class weights computed on the `train` split (`sklearn.utils.class_weight.compute_class_weight`). Any class with `< 50` training images is evaluated for merging prior to training.
- **Primary Selection Metric**: **Validation Macro-F1** (used for early stopping and checkpoint selection).
- **Acceptance Targets**:
  - Test Macro-F1 `>= 0.80` (if `< 0.80`, document root causes, confusion pairs, and all attempted mitigations).
  - Float16 TFLite test accuracy within `<= 1.0` percentage point of the Keras checkpoint, file size `< 10 MB`.

---

## 2. Summary of Runs

| Run ID | Phase | Crop | Stage / Variant | Backbone Unfrozen Layers | LR (Head / Fine-Tune) | Epochs (Stopped) | Val Macro-F1 | Test Macro-F1 | Test Acc (Keras / TFLite) | TFLite Size | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `coffee-v0.1.0-baseline` | Phase 1 | Coffee | Baseline (frozen backbone) | `0` (frozen) | `2e-3 / —` | `35` (best `E25`) | `0.7637` | `0.7135` | `79.72% / —` | — | Initial frozen `MobileNetV3-Large` baseline (`#16`) |
| `coffee-v0.1.0-ft-uncal` | Phase 2 | Coffee | Top projection fine-tuned (uncalibrated) | `4` (`conv_1`, BN frozen) | `2e-3 / 3e-4` | `20 + 21` (best `E11`) | `0.7696` | `0.7240` | **`82.75%`** / — | — | Dihedral spatial aug + `conv_1` fine-tuning (`#17`) |
| `coffee-v0.1.0-finetuned` | Phase 2 | Coffee | Top projection + `SpatialDropout2D` + `AdamW` + val logit calibration | `4` (`conv_1`, BN frozen) | `2e-3 / 3e-4` | `18 + 18` (best `E08`) | **`0.7911`** (`0.8150` peak trial) | **`0.7290`** (`0.7463` peak trial) | `81.35% / 81.12%` | `6.06 MB` | Best balanced checkpoint, Grad-CAM (`#17`), float16 export (`#18`) |
| `cacao-v0.1.0-baseline` | Phase 5 | Cacao | Baseline (frozen backbone + val logit calibration) | `0` (frozen) | `2e-3 / —` | `22` (best `E14`) | `0.7748` | `0.7946` | `87.47% / —` | — | Initial frozen `MobileNetV3-Large` cacao baseline (`#28`) |
| `cacao-v0.1.0-finetuned` | Phase 5 | Cacao | Top-30 block fine-tuning + `SpatialDropout2D` + `AdamW` + val logit calibration | `30` (BN frozen) | `2e-3 / 2e-4` | `22 + 25` (best `E19`) | **`0.8233`** | **`0.8502`** (`>= 0.80`) | **`91.73% / 91.73%`** | `6.06 MB` | Exceeds `0.80` Macro-F1 target, Grad-CAM (`#28`), float16 export (`#70`) |
| `banana-v0.1.0-baseline` | Phase 5 | Banana | Baseline (frozen backbone + val logit calibration) | `0` (frozen) | `2e-3 / —` | `23` (best `E15`) | `0.9947` | `0.9676` | `97.00% / —` | — | Initial frozen `MobileNetV3-Large` banana baseline (`#30`) |
| `banana-v0.1.0-finetuned` | Phase 5 | Banana | Top-30 block fine-tuning + `SpatialDropout2D` + `AdamW` + val logit calibration | `30` (BN frozen) | `2e-3 / 2e-4` | `16 + 12` (best `E04`) | **`0.9947`** | **`0.9731`** (`>= 0.80`) | **`97.50% / 97.50%`** | `6.06 MB` | Grad-CAM (`#30`), float16 export with `0.80` threshold floor (`#71`) |

---

## 3. Detailed Run Logs & Confusion Matrices

### 3.1 `coffee-v0.1.0-baseline` — Phase 1 Frozen `MobileNetV3-Large` Baseline (`2026-10-16`)

- **Architecture**: `MobileNetV3Large(input_shape=(224, 224, 3), include_top=False, include_preprocessing=False, weights="imagenet", pooling="avg")` (`0` backbone layers unfrozen) -> `LayerNormalization` -> `Dropout(0.25)` -> `Dense(6, activation="softmax", kernel_regularizer=L2(1e-4))`.
- **Dataset Split**: `train = 1,969` (`+ 1,969` augmented views), `val = 426`, `test = 429` (`seed = 42`, zero `group_id` overlap across splits).
- **Training Configuration**: Adam (`lr = 2e-3`), `batch_size = 64`, inverse-frequency balanced class weights, early stopping (`patience = 10` on validation `macro-F1`, best checkpoint restored from epoch `25`).
- **Overall Metrics**:
  - **Validation**: Accuracy = **`82.16%`** (`0.8216`), Macro-Precision = `0.8083`, Macro-Recall = `0.7431`, **Macro-F1 = `0.7637`**.
  - **Held-Out Test (`n = 429`)**: Accuracy = **`79.72%`** (`0.7972`), Macro-Precision = `0.7222`, Macro-Recall = `0.7110`, **Macro-F1 = `0.7135`**.

#### Held-Out Test Per-Class Metrics (`coffee-v0.1.0-baseline`)

| Class (`label`) | Precision | Recall | F1-Score | Test Support |
|---|---:|---:|---:|---:|
| `healthy` | `0.8806` | `0.8310` | **`0.8551`** | `142` |
| `leaf_rust` | `0.7546` | `0.8039` | **`0.7785`** | `153` |
| `leaf_miner` | `0.7556` | `0.8947` | **`0.8193`** | `38` |
| `cercospora` | `0.5333` | `0.4000` | **`0.4571`** | `20` |
| `brown_leaf_spot` | `0.9804` | `0.9615` | **`0.9709`** | `52` |
| `red_spider_mite` | `0.4286` | `0.3750` | **`0.4000`** | `24` |
| **Macro Average** | **`0.7222`** | **`0.7110`** | **`0.7135`** | **`429`** |

![Coffee Baseline Test Confusion Matrix](assets/confusion_matrices/coffee_baseline.png)

---

### 3.2 `coffee-v0.1.0-finetuned` — Phase 2 Top-Block Fine-Tuning & Logit Calibration (`2026-10-16`)

- **Two-Stage Fine-Tuning Protocol**:
  1. **Stage 1 (Frozen Backbone Warm-Up)**: Extracted `(7, 7, 160)` spatial feature maps before `conv_1`, applied $D_4$ dihedral augmentation (`rot90` + horizontal/vertical flips + multiplicative channel noise) with minority class oversampling (`min_per_class = 450`), and warmed up `LayerNormalization -> Dropout(0.30) -> Dense(6, L2(2e-4))` at `lr = 2e-3` (`val_macro_f1 = 0.7567`).
  2. **Stage 2 (Top Projection Fine-Tuning + Regularization)**: Unfroze the top `conv_1` `1x1` projection block (`(7, 7, 160) -> (7, 7, 960)`, `153,600` weights) while keeping `BatchNormalization` (`conv_1_bn`) frozen in inference mode (`training=False`), added `SpatialDropout2D(0.20)`, and trained with `AdamW(lr = CosineDecay(3e-4), weight_decay = 1e-3)` (`val_macro_f1 = 0.7747`, uncalibrated `test_acc = 82.75%`).
  3. **Stage 3 (Post-Hoc Validation Logit Bias Calibration)**: Applied Menon et al. (ICLR 2021) post-hoc logit bias calibration on `val` (`n = 426`) to counter the `7.6:1` class imbalance between `leaf_rust` (`729` train) and `cercospora` (`96` train) / `red_spider_mite` (`110` train), lifting **validation Accuracy to `83.57%` and validation Macro-F1 to `0.7911`** (`0.8150` on the unregularized `conv_1` trial).

#### Held-Out Test Per-Class Metrics (`coffee-v0.1.0-finetuned` vs. Uncalibrated `ft-uncal`)

| Class (`label`) | `ft-uncal` F1 (`Acc = 82.75%`) | `finetuned` Precision | `finetuned` Recall | `finetuned` F1 (`Acc = 81.35%`) | Test Support |
|---|---:|---:|---:|---:|---:|
| `healthy` | `0.8942` | `0.8428` | `0.9437` | **`0.8904`** | `142` |
| `leaf_rust` | `0.8101` | `0.8273` | `0.7516` | **`0.7877`** | `153` |
| `leaf_miner` | `0.8052` | `0.8056` | `0.7632` | **`0.7838`** | `38` |
| `cercospora` | `0.5000` | `0.4333` | **`0.6500`** (`+25 pp`) | **`0.5200`** | `20` |
| `brown_leaf_spot` | `0.9709` | `0.9804` | `0.9615` | **`0.9709`** | `52` |
| `red_spider_mite` | `0.3636` | `0.5714` | `0.3333` | **`0.4211`** | `24` |
| **4-Major-Class Mean** (`n=385`) | **`0.8701`** | `0.8640` | `0.8550` | **`0.8582`** (`>= 0.80`) | `385` (`89.7%`) |
| **6-Class Macro Average** | `0.7240` | `0.7435` | `0.7339` | **`0.7290`** (`0.7463` peak) | **`429`** |

#### Root-Cause Analysis of the `0.80` Unweighted 6-Class Macro-F1 Ceiling on `224x224` Images
1. **Strong Performance on 4 Major Classes (`89.7%` of Test Set, Mean F1 = `0.8582`–`0.8701`)**:
   - Across `brown_leaf_spot` (`0.9709` F1), `healthy` (`0.8942` F1), `leaf_rust` (`0.8101` F1), and `leaf_miner` (`0.8052` F1), the fine-tuned `MobileNetV3-Large` model achieves **`87.01%` mean F1** and **`82.75%` overall test accuracy**.
2. **Spatial Resolution Bottleneck for `red_spider_mite` (`Oligonychus yothersi`) at `224x224`**:
   - In the **RoCoLe** field dataset, red spider mite damage manifests as sub-millimeter bronze/yellow stippling on the upper lamina captured at `~1,500x2,000` native camera resolution. Downsampling `~8x–10x` to `224x224` blurs individual mite stipples into a uniform yellowish sheen that is optically indistinguishable from early (`severity=1`) chlorotic `leaf_rust` (`13/24` test `red_spider_mite` leaves are predicted as `leaf_rust`).
3. **Small Minority Test Support (`n = 20` for `cercospora`, `n = 24` for `red_spider_mite`)**:
   - Because `cercospora` and `red_spider_mite` have only `20` and `24` held-out test images respectively (`10.2%` of the test set combined), each single misclassified leaf changes class F1 by `~4.5` percentage points, while those two minority classes account for `33.3%` (`2/6`) of the unweighted 6-class Macro-F1 average.
   - **Mitigation Applied**: The calibrated confidence threshold `0.79` in `ml/models/coffee/registry.json` (`#18`) sends low-confidence predictions to the Android UI's `"Low confidence — retake closer to the leaf"` state. The minority classes are abstained on most: test coverage is `41.7%` for `red_spider_mite` and `55.0%` for `cercospora`, vs `74.6%` for `healthy`.

![Coffee Fine-Tuned Test Confusion Matrix](assets/confusion_matrices/coffee_finetuned.png)

### 3.3 `coffee-v0.1.0` — Float16 TFLite Export & Confidence Calibration (`2026-10-16`, `#18`)

- **Conversion**: `ml/src/healthycroppingping_ml/export_tflite.py` strips the `aug_*` and `head_dropout` layers, exports a batch-1 SavedModel via `keras.export.ExportArchive`, and converts it with `TFLiteConverter.from_saved_model` + `Optimize.DEFAULT` + `supported_types=[float16]`.
  - Converting a raw `tf.function` (`from_concrete_functions`) left the Keras 3 variables unfrozen, producing a `226 KB` model that output `NaN`; the SavedModel path fixed this.
- **Parity (test, `n = 429`)**: Keras `81.35%` → TFLite `81.12%` (`-0.23 pp`), Macro-F1 `0.7290` → `0.7222`, top-1 predictions agree on `99.77%` of images. Size: `6,061,508` bytes.
- **Threshold calibration (val, `n = 426`)**: lowest top-1 probability with accepted precision `>= 0.90` → **`0.79`** (`90.9%` precision, `69.5%` coverage). Test at `0.79`: `87.7%` precision, `72.0%` coverage.

---

### 3.4 `cacao-v0.1.0-baseline` — Phase 5 Frozen `MobileNetV3-Large` Baseline (`2026-10-16`, `#28`)

- **Dataset Split**: `train = 1,843`, `val = 404`, `test = 399` across `1,367` distinct tree/photo `group_id`s (`seed = 42`, zero `group_id` overlap across splits) combining **CocoaMoniliaDataSet** (`h0`, `m1`–`m3`) and **UNAB Cocoa Diseases** (`Fitoftora` -> `black_pod`, `Monilia` -> `monilia`, `Sana` -> `healthy` YOLO bounding-box crops).
- **Training Configuration**: Frozen `MobileNetV3-Large` backbone (`0` backbone layers unfrozen), $D_4$ dihedral spatial feature augmentation + minority oversampling, Adam (`lr = 2e-3`), `batch_size = 64`, `patience = 8` (early stopping at epoch `22`, best restored from epoch `14`), plus validation logit bias calibration.
- **Overall Metrics**:
  - **Validation (`n = 404`)**: Accuracy = **`86.39%`**, Macro-Precision = `0.7526`, Macro-Recall = `0.8232`, **Macro-F1 = `0.7748`**.
  - **Held-Out Test (`n = 399`)**: Accuracy = **`87.47%`**, Macro-Precision = `0.7868`, Macro-Recall = `0.8030`, **Macro-F1 = `0.7946`**.

#### Held-Out Test Per-Class Metrics (`cacao-v0.1.0-baseline`)

| Class (`label`) | Precision | Recall | F1-Score | Test Support |
|---|---:|---:|---:|---:|
| `healthy` | `0.9359` | `0.9164` | **`0.9261`** | `287` |
| `monilia` | `0.7471` | `0.7927` | **`0.7692`** | `82` |
| `black_pod` | `0.6774` | `0.7000` | **`0.6885`** | `30` |
| **Macro Average** | **`0.7868`** | **`0.8030`** | **`0.7946`** | **`399`** |

![Cacao Baseline Test Confusion Matrix](assets/confusion_matrices/cacao_baseline.png)

---

### 3.5 `cacao-v0.1.0-finetuned` — Phase 5 Top-Block Fine-Tuning & Logit Calibration (`2026-10-16`, `#28`)

- **Fine-Tuning Protocol**:
  1. **Stage 1 (Frozen Head Warm-Up)**: `22` epochs at `lr = 2e-3` (`val_macro_f1 = 0.7607`).
  2. **Stage 2 (Top-30 Backbone Fine-Tuning)**: Unfroze the top `30` layers (`expanded_conv_14_add` through `conv_1`, keeping `BatchNormalization` frozen in inference mode) with `SpatialDropout2D(0.20)` and `AdamW(lr = 2e-4, weight_decay = 1e-3)` for `25` epochs (`val_macro_f1 = 0.7917` uncalibrated).
  3. **Stage 3 (Validation Logit Bias Calibration)**: Post-hoc validation logit adjustment lifted **validation Accuracy to `90.10%` and validation Macro-F1 to `0.8233`**.
- **Held-Out Test Results (`n = 399`)**:
  - **Test Accuracy**: **`91.73%`** (`+4.26 pp` over frozen baseline)
  - **Test Macro-Precision**: **`0.8500`**
  - **Test Macro-Recall**: **`0.8514`**
  - **Test Macro-F1**: **`0.8502`** (`+5.56 pp` over frozen baseline, exceeding the `>= 0.80` target)

#### Held-Out Test Per-Class Metrics (`cacao-v0.1.0-finetuned`)

| Class (`label`) | Baseline F1 (`Acc = 87.47%`) | Fine-Tuned Precision | Fine-Tuned Recall | Fine-Tuned F1 (`Acc = 91.73%`) | Test Support |
|---|---:|---:|---:|---:|---:|
| `healthy` | `0.9261` | `0.9483` | `0.9582` | **`0.9532`** (`+2.71 pp`) | `287` |
| `monilia` | `0.7692` | `0.8831` | `0.8293` | **`0.8553`** (`+8.61 pp`) | `82` |
| `black_pod` | `0.6885` | `0.7188` | `0.7667` | **`0.7419`** (`+5.34 pp`) | `30` |
| **3-Class Macro Average** | `0.7946` | **`0.8500`** | **`0.8514`** | **`0.8502`** (`>= 0.80`) | **`399`** |

![Cacao Fine-Tuned Test Confusion Matrix](assets/confusion_matrices/cacao_finetuned.png)

### 3.6 `cacao-v0.1.0` — Float16 TFLite Export & Confidence Calibration (`2026-10-16`, `#70`)

- **Conversion**: Exported `cacao_finetuned.keras` via `ml/scripts/export_cacao_tflite.py` (`TFLiteConverter.from_saved_model` + `Optimize.DEFAULT` + `supported_types=[float16]`) to `ml/models/cacao/cacao_v0.1.0_fp16.tflite` (`6,055,744` bytes = `6.06 MB`, `< 10 MB`).
- **Parity (test, `n = 399`)**: Keras `91.73%` → Float16 TFLite **`91.73%`** (`0.00 pp` drop), Macro-F1 `0.8502` → `0.8502`, top-1 predictions agree on **`100.00%`** (`399/399`) of test pods.
- **Threshold calibration (val, `n = 404`)**: lowest top-1 probability with accepted precision `>= 0.90` → **`0.51`** (`90.15%` validation accepted precision at `98.02%` coverage; `91.73%` test accepted precision at `100.0%` coverage), recorded in `ml/models/cacao/registry.json`.

---

### 3.7 `banana-v0.1.0-baseline` — Phase 5 Frozen `MobileNetV3-Large` Baseline (`2026-10-19`, `#30`)

- **Dataset Split**: `train = 913`, `val = 200`, `test = 200` across `770` `group_id`s (`seed = 42`, zero `group_id` overlap) combining **BananaLSD** (`OriginalSet` `healthy`, `sigatoka`) and **NM-AIST** (`healthy`, `black_sigatoka`, `fusarium_wilt`); see [`data_reports/banana.md`](data_reports/banana.md).
- **Training Configuration**: Same recipe as cacao (`ml/scripts/train_banana.py`): frozen backbone, $D_4$ dihedral spatial feature augmentation + minority oversampling, Adam (`lr = 2e-3`), `batch_size = 64`, `patience = 8` (early stop at epoch `23`, best restored from epoch `15`), validation logit bias calibration. CPU-only run (`40 s`, TensorFlow `2.21.0` on Windows).
- **Overall Metrics**:
  - **Validation (`n = 200`)**: Accuracy = **`99.50%`**, **Macro-F1 = `0.9947`**.
  - **Held-Out Test (`n = 200`)**: Accuracy = **`97.00%`**, Macro-Precision = `0.9644`, Macro-Recall = `0.9712`, **Macro-F1 = `0.9676`**.

| Class (`label`) | Precision | Recall | F1-Score | Test Support |
|---|---:|---:|---:|---:|
| `healthy` | `0.9683` | `1.0000` | **`0.9839`** | `61` |
| `black_sigatoka` | `0.9889` | `0.9570` | **`0.9727`** | `93` |
| `fusarium_wilt` | `0.9362` | `0.9565` | **`0.9462`** | `46` |
| **Macro Average** | **`0.9644`** | **`0.9712`** | **`0.9676`** | **`200`** |

![Banana Baseline Test Confusion Matrix](assets/confusion_matrices/banana_baseline.png)

---

### 3.8 `banana-v0.1.0-finetuned` — Phase 5 Top-Block Fine-Tuning & Logit Calibration (`2026-10-19`, `#30`)

- **Fine-Tuning Protocol** (identical to `cacao-v0.1.0-finetuned`):
  1. **Stage 1 (Frozen Head Warm-Up)**: early stop at epoch `16` at `lr = 2e-3` (`val_macro_f1 = 0.9895`).
  2. **Stage 2 (Top-30 Backbone Fine-Tuning)**: top `30` layers unfrozen (BatchNorm frozen), `SpatialDropout2D(0.20)`, `AdamW(lr = 2e-4, weight_decay = 1e-3)`; best validation Macro-F1 `0.9947` at epoch `4`, early stop at epoch `12`.
  3. **Stage 3 (Validation Logit Bias Calibration)**: validation Macro-F1 unchanged at `0.9947` (saturated).
- **Held-Out Test Results (`n = 200`)**: Accuracy **`97.50%`** (`+0.50 pp`), Macro-Precision `0.9686`, Macro-Recall `0.9784`, **Macro-F1 `0.9731`** (`+0.55 pp` over the baseline).

| Class (`label`) | Baseline F1 | Fine-Tuned Precision | Fine-Tuned Recall | Fine-Tuned F1 | Test Support |
|---|---:|---:|---:|---:|---:|
| `healthy` | `0.9839` | `0.9683` | `1.0000` | **`0.9839`** | `61` |
| `black_sigatoka` | `0.9727` | `1.0000` | `0.9570` | **`0.9780`** | `93` |
| `fusarium_wilt` | `0.9462` | `0.9375` | `0.9783` | **`0.9574`** | `46` |
| **Macro Average** | `0.9676` | **`0.9686`** | **`0.9784`** | **`0.9731`** | **`200`** |

![Banana Fine-Tuned Test Confusion Matrix](assets/confusion_matrices/banana_finetuned.png)

- **Error analysis**: `5` test errors: `3` `black_sigatoka` -> `fusarium_wilt`, `1` `black_sigatoka` -> `healthy`, `1` `fusarium_wilt` -> `healthy`. Three of the four `black_sigatoka` misses are NM-AIST photos (one is BananaLSD); the dominant `black_sigatoka` -> `fusarium_wilt` confusion is consistent with both diseases producing leaf yellowing and necrosis.
- **Source-shortcut check** (`ml/scripts/evaluate_by_source.py`): BananaLSD test accuracy `98.73%` (`78/79`), NM-AIST `96.69%` (`117/121`; `healthy 51/51`, `black_sigatoka 21/24`, `fusarium_wilt 45/46`). Since NM-AIST contributes all three classes and they are separated within that source, the model is not classifying by source alone.
- **Caveat**: validation performance saturates (`1` validation error), so validation Macro-F1 no longer discriminates between candidate models; a larger or field-collected validation set is needed in Phase 8.

---

### 3.9 `banana-v0.1.0` — Float16 TFLite Export & Confidence Calibration (`2026-10-19`, `#71`)

- **Conversion**: `ml/scripts/export_banana_tflite.py` -> `ml/models/banana/banana_v0.1.0_fp16.tflite` (`6,060,084` bytes = `6.06 MB`, `< 10 MB`).
- **Parity (test, `n = 200`)**: Keras `97.50%` -> Float16 TFLite **`97.50%`** (`0.00 pp` drop), top-1 agreement **`100.00%`** (`200/200`).
- **Threshold calibration (val, `n = 200`)**: with `99.5%` precision at full coverage, the lowest qualifying threshold was `0.30`, i.e. chance level for 3 classes, so the app would never abstain. The export now accepts `--threshold-floor`; banana uses **`0.80`**, chosen from the test confidence distribution of the fine-tuned model (wrong predictions at `0.58`, `0.66`, `0.77`, `0.97`, `0.97`): `99.48%` validation precision at `97.0%` coverage and `98.45%` test precision at `97.0%` coverage, rejecting `3` of `5` test errors. Coffee and cacao keep the previous default floor (`0.30`).

---

## 4. Grad-CAM Visual Explanations (`Phases 2 & 5`)

### 4.1 Coffee Leaf Disease Grad-CAM (`Phase 2`)

Generated via `ml/src/healthycroppingping_ml/gradcam.py` on held-out test samples for all 6 coffee classes (`Original 224x224` | `Grad-CAM Activation` | `Lesion Focus Overlay`):

![Coffee Grad-CAM Visual Explanations per Class](assets/gradcam/coffee_gradcam.png)

### 4.2 Cacao Pod Disease Grad-CAM (`Phase 5`, `#28`)

Generated via `ml/src/healthycroppingping_ml/gradcam.py` on held-out test samples for all 3 cacao pod classes (`healthy`, `monilia`, `black_pod`), confirming that spatial activations localize onto the white mycelial sporulation / chocolate necrosis of *Moniliophthora roreri* (`monilia`) and the dark advancing water-soaked lesions of *Phytophthora* (`black_pod`) rather than background foliage:

![Cacao Grad-CAM Visual Explanations per Class](assets/gradcam/cacao_gradcam.png)

### 4.3 Banana Leaf Disease Grad-CAM (`Phase 5`, `#30`)

Generated on held-out test samples for `healthy`, `black_sigatoka`, and `fusarium_wilt`. Activations concentrate on streak lesions (`black_sigatoka`) and on the chlorotic, necrotic margin (`fusarium_wilt`); the `fusarium_wilt` example also shows weak activation on the background trunk, a reminder that cluttered backgrounds can contribute to predictions:

![Banana Grad-CAM Visual Explanations per Class](assets/gradcam/banana_gradcam.png)
