import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/target/**",
      "**/.anchor/**",
      "docs/**",
    ],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
);
