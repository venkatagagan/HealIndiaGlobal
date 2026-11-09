/**
 * `@hig/shared` - everything in one entry point. Prefer the sub-path entry points in app code
 * (`@hig/shared/api`, `/auth`, `/ui`, `/layout`, `/lib`) for clearer dependencies.
 */
export * from './api';
export * from './auth';
export * from './ui';
export * from './layout';
export * from './lib';
