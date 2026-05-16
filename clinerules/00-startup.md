# Startup / Project Orientation Rule

At the start of every new task in this workspace:

1. Read `AGENTS.md` if it exists.
2. Inspect the project structure before proposing or making changes.
3. Read the main project config files such as `package.json`, `vite.config.*`, `next.config.*`, `tsconfig.json`, or equivalent files when present.
4. Identify the app framework, main entry points, build/run/test commands, and deployment assumptions.
5. Do not edit files until the user provides a feature request or bug report and approves moving from planning into implementation.
6. For feature requests or bug reports, first summarize:
   - what area of the app is likely involved
   - which files may need to change
   - the safest implementation plan
   - any risks or questions
7. After changes, summarize changed files and update `CHANGELOG.md` if one exists.
8. Never commit secrets, print secrets, edit `.env`, or deploy unless explicitly asked.