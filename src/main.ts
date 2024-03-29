/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as xgovw from "xgovw-lint-js";
import core from "@actions/core";
import github from "@actions/github";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils.js";
import { throttling } from "@octokit/plugin-throttling";
import { ThrottlingOptions } from "@octokit/plugin-throttling/dist-types/types";
import { PullRequestEvent } from "@octokit/webhooks-types";

async function main() {
  try {
    const ThrottledOctokit = GitHub.plugin(throttling);

    const context = github.context;
    const githubToken = core.getInput("token");
    const throttle: ThrottlingOptions = {
      onRateLimit: (retryAfter, options: any) => {
        const method = options?.method || "<unknown>";
        const url = options?.url || "<unknown>";

        octokit.log.warn(
          `Request quota exhausted for request ${method} ${url}`
        );

        // Retry twice after hitting a rate limit error, then give up
        if (options?.request?.retryCount <= 2) {
          console.log(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (_retryAfter, options: any) => {
        const method = options?.method || "<unknown>";
        const url = options?.url || "<unknown>";

        // does not retry, only logs a warning
        octokit.log.warn(`Abuse detected for request ${method} ${url}`);
      },
    };
    const octokit = new ThrottledOctokit(
      getOctokitOptions(githubToken, { throttle })
    );

    switch (context.eventName) {
      case "pull_request":
      case "pull_request_target":
        break;
      default:
        core.warning(
          "xgovw-action should only be configured to run on pull requests"
        );
        return;
    }

    const uncheckedText = core.getInput("unchecked") || "";
    const unchecked = [];

    for (let item of uncheckedText.split(",")) {
      unchecked.push(`xgov-${item.trim()}.md`);
    }

    const pull_event = context.payload as PullRequestEvent;
    const pull = pull_event.pull_request;

    const files = [];

    const fetched = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: pull.base.repo.owner.login,
      repo: pull.base.repo.name,
      pull_number: pull.number,
    });

    for (let entry of fetched) {
      const filename = entry.filename;
      const status = entry.status;

      if (status === "removed") {
        // Don't consider deleted files.
        continue;
      }

      if (!filename.startsWith("Proposals/")) {
        // Only check files in the `Proposals/` directory.
        continue;
      }

      if (unchecked.some((i) => filename.endsWith(i))) {
        // Don't check certain files, as defined in the workflow.
        continue;
      }

      files.push(filename);
    }

    if (!files.length) {
      core.notice("no files to check");
      return;
    }

    const warningOnly = core.getInput("warning-only") == "true";

    const result = await xgovw.lint(files);
    let hasErrors = false;

    for (let snippet of result) {
      let formatted;

      try {
        formatted = xgovw.format(snippet);
      } catch {
        // FIXME: This happens when there's an escape sequence in the JSON.
        //        serde_json can't deserialize it into an &str, so we display
        //        what we can.
        formatted = snippet.title?.label;
        if (!formatted) {
          formatted = "<failed to render diagnostic, this is a bug in xgovw>";
        }
      }

      let lineNumber = null;
      let file = null;

      if (snippet.slices?.length > 0) {
        lineNumber = snippet.slices[0].line_start;
        file = snippet.slices[0].origin;
      }

      const properties = {
        title: snippet.title?.label,
        startLine: lineNumber,
        file: file,
      };

      switch (snippet.title?.annotation_type) {
        case "Help":
        case "Note":
        case "Info":
          core.notice(formatted, properties);
          break;
        case "Warning":
          core.warning(formatted, properties);
          break;
        case "Error":
        default:
          if (warningOnly) {
            core.warning(formatted, properties);
          } else {
            core.error(formatted, properties);
            hasErrors = true;
          }
          break;
      }
    }

    if (hasErrors) {
      core.setFailed("validation found errors :(");
    }
  } catch (error) {
    console.log(error);
    let msg = "failed";
    if (error instanceof Error) {
      msg = error.message;
    }
    core.setFailed(msg);
  }
}

main();
