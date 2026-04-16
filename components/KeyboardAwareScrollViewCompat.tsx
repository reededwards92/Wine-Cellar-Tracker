import { Platform, ScrollView, ScrollViewProps } from "react-native";

// react-native-keyboard-controller is native-only. Conditionally require
// it so the import itself doesn't crash on web.
let NativeKeyboardAwareScrollView: any;
let NativeKeyboardAwareScrollViewProps: any;
if (Platform.OS !== "web") {
  const kbc = require("react-native-keyboard-controller");
  NativeKeyboardAwareScrollView = kbc.KeyboardAwareScrollView;
}

type Props = ScrollViewProps & { [key: string]: any };

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  if (Platform.OS === "web" || !NativeKeyboardAwareScrollView) {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <NativeKeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </NativeKeyboardAwareScrollView>
  );
}
