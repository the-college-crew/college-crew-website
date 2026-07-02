@AGENTS.md

# Git Identity
The College Crew business project — kept separate from personal projects.
How the business GitHub account is selected differs per machine:

- On Zach's machine: remotes must use the `github.com-collegecrew` SSH
  host alias (e.g. `git@github.com-collegecrew:the-college-crew/...`),
  never plain `github.com` — that would authenticate with his personal key.
- On Ari's machine: plain `github.com` URLs are fine — his git config
  selects the business account automatically by folder.
