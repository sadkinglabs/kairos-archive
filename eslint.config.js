import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".astro/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  { files: ["src/**/*.ts", "functions/**/*.ts"], rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
);
