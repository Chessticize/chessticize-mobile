import React from "react";
import { Modal, type ModalProps } from "react-native";

// Every orientation the app's windows can take. React Native's iOS Modal
// defaults to portrait only: over a landscape iPad window it forces a rotation,
// and in a landscape-only window (full-screen validation builds) UIKit throws
// "Supported orientations has no common orientation with the application".
// Android ignores the prop.
export const MODAL_SUPPORTED_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right"
];

/**
 * The app's only entry point to React Native's Modal. It always allows every
 * orientation; a source guard test keeps other files from importing Modal.
 */
export function AppModal(
  props: React.PropsWithChildren<Omit<ModalProps, "supportedOrientations">>
): React.JSX.Element {
  return <Modal {...props} supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS} />;
}
