"""MobileNetV3-Large transfer-learning architecture for HealthyCrop."""

from __future__ import annotations

from typing import Any


def build_mobilenetv3_classifier(
    num_classes: int,
    image_size: int = 224,
    weights: str | None = "imagenet",
    dropout_rate: float = 0.2,
    learning_rate: float = 1e-3,
    fine_tune_top_layers: int = 0,
    use_augmentation: bool = True,
) -> Any:
    """Build a compiled MobileNetV3-Large model accepting `[-1, 1]` normalized RGB tensors.

    Args:
        num_classes: Number of target diagnostic classes.
        image_size: Input spatial dimension (default 224).
        weights: Backbone initialization (`"imagenet"` or `None` for fast unit tests).
        dropout_rate: Dropout probability before the classification head.
        learning_rate: Adam optimizer learning rate.
        fine_tune_top_layers: If `0`, freeze the entire MobileNetV3-Large backbone
            (Phase 1 baseline / Stage 1 head warm-up). If `> 0`, unfreeze the top
            `fine_tune_top_layers` non-BatchNormalization layers of the backbone.
        use_augmentation: Whether to include in-graph training-only geometric and
            photometric augmentation layers.
    """
    import keras
    from keras import layers

    inputs = keras.Input(shape=(image_size, image_size, 3), dtype="float32", name="input_rgb_norm")
    x = inputs

    if use_augmentation:
        x = layers.RandomFlip("horizontal_and_vertical", name="aug_flip")(x)
        x = layers.RandomRotation(0.08, fill_mode="reflect", name="aug_rotation")(x)
        x = layers.RandomZoom(0.10, fill_mode="reflect", name="aug_zoom")(x)
        x = layers.RandomContrast(0.10, value_range=(-1.0, 1.0), name="aug_contrast")(x)

    backbone = keras.applications.MobileNetV3Large(
        input_shape=(image_size, image_size, 3),
        include_top=False,
        include_preprocessing=False,
        weights=weights,
        pooling="avg",
    )

    configure_backbone_trainability(backbone, fine_tune_top_layers=fine_tune_top_layers)

    # Pass training=False if backbone is completely frozen so BatchNorm stats stay locked
    backbone_training = False if fine_tune_top_layers <= 0 else None
    features = backbone(x, training=backbone_training)
    normed = layers.LayerNormalization(name="head_norm")(features)
    dropped = layers.Dropout(dropout_rate, name="head_dropout")(normed)
    outputs = layers.Dense(num_classes, activation="softmax", name="class_probs")(dropped)

    model = keras.Model(inputs=inputs, outputs=outputs, name="healthycrop_mobilenetv3_large")
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
        loss=keras.losses.SparseCategoricalCrossentropy(),
        metrics=[keras.metrics.SparseCategoricalAccuracy(name="accuracy")],
    )
    return model


def configure_backbone_trainability(
    backbone: Any,
    fine_tune_top_layers: int = 0,
) -> None:
    """Freeze backbone or unfreeze top `N` layers while keeping BatchNormalization frozen."""
    from keras import layers

    if fine_tune_top_layers <= 0:
        backbone.trainable = False
        for layer in backbone.layers:
            layer.trainable = False
        return

    backbone.trainable = True
    total_layers = len(backbone.layers)
    cutoff = max(0, total_layers - fine_tune_top_layers)

    for idx, layer in enumerate(backbone.layers):
        if idx < cutoff or isinstance(layer, layers.BatchNormalization):
            layer.trainable = False
        else:
            layer.trainable = True
