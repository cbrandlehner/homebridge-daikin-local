import json from '@eslint/json';
import {defineConfig} from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.json'],
    plugins: {json},
    language: 'json/jsonc',
  },
]);
