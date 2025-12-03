import { FileNode, SavedProject } from "../types";

const GITHUB_API_BASE = "https://api.github.com";

export const verifyGithubToken = async (token: string): Promise<string> => {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
  });
  if (!response.ok) throw new Error("Invalid GitHub Token");
  const data = await response.json();
  return data.login;
};

export const createRepository = async (token: string, name: string, description: string) => {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description, private: false, auto_init: true }),
  });
  if (!response.ok) {
     const err = await response.json();
     throw new Error(`GitHub Create Repo Error: ${err.message}`);
  }
  return await response.json();
};

export const pushFilesToRepo = async (token: string, username: string, repoName: string, files: FileNode[], onProgress: (msg: string) => void) => {
  for (const file of files) {
    onProgress(`Pushing ${file.path}...`);
    let sha: string | undefined = undefined;
    try {
        const checkRes = await fetch(`${GITHUB_API_BASE}/repos/${username}/${repoName}/contents/${file.path}`, {
            headers: { Authorization: `token ${token}` }
        });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            sha = checkData.sha;
        }
    } catch (e) {}

    const contentEncoded = btoa(unescape(encodeURIComponent(file.content)));
    const res = await fetch(`${GITHUB_API_BASE}/repos/${username}/${repoName}/contents/${file.path}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Add ${file.path} via AutoDeploy Agent`,
        content: contentEncoded,
        sha: sha,
      }),
    });
    if (!res.ok) throw new Error(`Failed to upload ${file.path}`);
  }
};

const GIST_FILENAME = "autodeploy-data.json";
const GIST_DESC = "autodeploy-sync";

export const loadHistoryFromGist = async (token: string): Promise<SavedProject[] | null> => {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/gists`, { headers: { Authorization: `token ${token}` } });
    if (!res.ok) return null;
    const gists = await res.json();
    const syncGist = gists.find((g: any) => g.description === GIST_DESC);
    if (!syncGist) return null;
    const file = syncGist.files[GIST_FILENAME];
    if (file && file.raw_url) {
       const contentRes = await fetch(file.raw_url);
       const data = await contentRes.json();
       return data.history || [];
    }
    return null;
  } catch (e) { return null; }
};

export const saveHistoryToGist = async (token: string, history: SavedProject[]) => {
  try {
    const listRes = await fetch(`${GITHUB_API_BASE}/gists`, { headers: { Authorization: `token ${token}` } });
    const gists = await listRes.json();
    const existingGist = gists.find((g: any) => g.description === GIST_DESC);
    const payload = {
        description: GIST_DESC,
        public: false,
        files: { [GIST_FILENAME]: { content: JSON.stringify({ history, lastUpdated: new Date().toISOString() }) } }
    };
    if (existingGist) {
        await fetch(`${GITHUB_API_BASE}/gists/${existingGist.id}`, { method: "PATCH", headers: { Authorization: `token ${token}` }, body: JSON.stringify(payload) });
    } else {
        await fetch(`${GITHUB_API_BASE}/gists`, { method: "POST", headers: { Authorization: `token ${token}` }, body: JSON.stringify(payload) });
    }
  } catch (e) { console.error("Gist Sync Error", e); }
};