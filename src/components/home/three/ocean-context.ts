import { createContext } from 'react';
import type { OceanUniforms } from './ocean-mesh';

/** The island's water, shared with the animals swimming in it so they tint and wobble with the same waves. */
export const OceanContext = createContext<OceanUniforms | null>(null);
