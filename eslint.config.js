import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".astro/**", "node_modules/**", "worker/dist/**", "**/.wrangler/**"] },
  ...tseslint.configs.recommended,
  { files: ["src/**/*.ts", "functions/**/*.ts", "worker/**/*.ts"], rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
);
