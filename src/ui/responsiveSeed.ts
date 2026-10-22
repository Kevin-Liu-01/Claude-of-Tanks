// The inline seed every document runs at the top of its body (tools/viteResponsiveSeed.ts bundles this file into an
// IIFE): the first paint lays out with its viewport bands instead of picking them up when the page module runs.
import { seedResponsiveLayout } from './responsiveLayout.ts';

seedResponsiveLayout();
