# @waylay/ssblc

Static Site Broken Link Checker

![CI Status Badge](https://github.com/waylayio/ssblc/workflows/CI/badge.svg?branch=master)

A broken-link checker for static sites, like the ones generated with docsify that can get used, for example, for CI purposes on docsify docs (this is what I've developed it for).

It recursively checks internal links found on the static website (until every internal link is checked) and (without recursion) outgoing links. This is achieved by finding `href` attributes in the HTML, meaning also stylesheets included with `<link href="some-file.css">` get checked.

## Installation
You can either run it by just using `npx`, in which case you won't have to install it, or first install it with

```shell script
npm install -g @waylay/ssblc
```

## Usage
When you are in the folder of your static website (i.e., there is an `index.html` in this folder), simply run

```shell script
ssblc
```

after which the checker will begin its work.

To use it with `npx`, simply run

```shell script
npx @waylay/ssblc
```

Alternatively, you can also specify an absolute or relative path to the directory of the site, e.g., like this:

```shell script
ssblc --dir ../my-site
```

If not present, the checker will use the current working directory as the base directory.

## Additional Options

### `--context [file]`

Loads a JSON file with context variables for link replacement. The file should contain a JSON object with the following structure:

```json
{
  "vars": {
    "some-key": "some-value",
    "another-key": "another-value"
  }
}
```

The context variables can be used in the `href` attributes of the HTML, e.g., `<a href="{{vars.some-key}}">Some Link</a>`.

### `--max-concurrent-checks [number]`

Sets the maximum number of concurrent checks (default: 5).

### `--protocol-timeout [milliseconds]`

Sets the protocol timeout for Puppeteer (default: 30000 ms).

### `--page-load-timeout [milliseconds]`

Sets the page load timeout for Puppeteer (default: 30000 ms).

### `--port [number]`

Sets the port number for the local server (default: 3000).

### `--ignore-statuses [statuses]`

Comma-separated list of HTTP statuses to ignore (e.g., 401,403).

### `--dry-run`

If present, exit with code 0 even if errors are found.

## Examples

### Check a static site in the current working directory

```shell script
ssblc
```

### Check a static site in a different directory

```shell script
ssblc --dir ../my-site
```

### Check a static site with context variables

```shell script
ssblc --context context.json
```

### Check a static site using a different port number

```shell script
ssblc --port 8080
```

### Check a static site using a different protocol timeout

```shell script
ssblc --protocol-timeout 60000
```

### Check a static site using a different page load timeout

```shell script
ssblc --page-load-timeout 60000
```

### Check a static site using a different maximum number of concurrent checks

```shell script
ssblc --max-concurrent-checks 10
```

### Check a static site with ignored HTTP statuses

```shell script
ssblc --ignore-statuses 401,403
```

### Check a static site and exit with code 0 even if errors are found

```shell script
ssblc --dry-run
```
