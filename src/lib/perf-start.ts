import { perfMark } from './perf-report';

/** Imported first by the root layout (src/app/_layout.tsx): the moment the app's own JavaScript starts running, for the performance report. */
perfMark('js-start');
