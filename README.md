xgovw-action
===========

A GitHub Action for running `xgovw`

## Usage

Here's an example workflow (so it would go in `.github/workflows/ci.yml` or similar):

```yaml
on:
  pull_request:

name: ci

jobs:
  check:
    name: Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3.0.2
      - uses: algorandfoundation/xgovw-action@dist
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Building & Deploying

```bash
npm install         # Grab dependencies.
npm run build       # Compile TypeScript and create bundle.
git add .
git commit -m "update"
git push            # Make the new build available.
```
