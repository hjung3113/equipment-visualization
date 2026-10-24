import type { ComponentType } from 'react';
import type { ModuleScreenProps } from '@ap/contracts';
import { FOCUS_SCREEN, TOPVIEW_SCREEN } from '../manifest.js';
import { FocusScreen } from './FocusScreen.js';
import { TopViewScreen } from './TopViewScreen.js';

/** The screen components by the manifest's bare screen ids (the host registers them as `eqv:<id>`). */
export const eqvScreens: Record<typeof TOPVIEW_SCREEN | typeof FOCUS_SCREEN, ComponentType<ModuleScreenProps>> = {
  [TOPVIEW_SCREEN]: TopViewScreen,
  [FOCUS_SCREEN]: FocusScreen,
};
