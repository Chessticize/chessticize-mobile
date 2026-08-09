# React Native 0.86 keeps this callback private while Chessticize temporarily
# coordinates it with the typed predictive-Back bridge by field name.
-keepclassmembers,allowoptimization class com.facebook.react.ReactActivity {
    androidx.activity.OnBackPressedCallback mBackPressedCallback;
}

# API-gated loading deliberately avoids verifying API 34 classes on older
# Android versions. Preserve only the class name and constructor used by that
# reflection boundary; the implementation remains optimizable.
-keep,allowoptimization class com.chessticize.mobile.MobilePredictiveBackApi34Delegate {
    <init>(com.chessticize.mobile.MobilePredictiveBackEventSink);
}

# Stockfish exports name-based JNI entry points for exactly these native
# methods. Keep their containing class and native names without retaining the
# rest of the application package.
-keepclasseswithmembernames,includedescriptorclasses,allowoptimization class com.chessticize.mobile.NativeStockfishEngineModule {
    native <methods>;
}
