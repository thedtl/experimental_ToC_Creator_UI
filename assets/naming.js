/**
 * Output-naming convention retained from the live frontend:
 * https://thedtl.github.io/toc-creator-ui/app.js?v=20260801-reset-route-tokens
 * Observed 2026-09-05; complete live asset SHA-256:
 * 285436b395e6f022c8de42b6dd1f1ac0ffc1630d64bcff32a82669be8fd2d3c2
 *
 * buildFilename({title, contributors:[{role,last,first}], mmsId, oclc, sourceCode})
 * binds ordinary values instead of the live form. The filename formatter,
 * contributor credits, sanitization, ID extraction and metadata suggestions
 * remain the same. The experimental fallback uses the source name when visible
 * metadata is missing and also preserves dot-form source codes (1.4330).
 * This module neither reads PDFs nor calls a provider.
 */
const CONTRIBUTOR_ROLES = {
  author: { label: "Author" },
  editor: { label: "Editor", primarySingle: "ed.", primaryPlural: "eds.", secondary: "Edited by" },
  compiler: { label: "Compiler", primarySingle: "comp.", primaryPlural: "comps.", secondary: "Compiled by" },
};
const CONTRIBUTOR_ROLE_ORDER = ["author", "editor", "compiler"];

function cleanFilenamePart(value) {
  return (value || "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBookmarkedSuffix(value) {
  return (value || "")
    .replace(/\s*\[bookmarked\]\s*$/i, "")
    .replace(/\s*\(bookmarked\)\s*$/i, "")
    .trim();
}

function normalizeIdentifier(value) {
  return cleanFilenamePart(value)
    .replace(/\b(?:mms\s*id|oclc|ocn)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSourceCode(value) {
  return cleanFilenamePart(value)
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeContributorRole(role) {
  const cleaned = cleanFilenamePart(role).toLowerCase();
  return CONTRIBUTOR_ROLES[cleaned] ? cleaned : "author";
}

function normalizeContributor(contributor = {}) {
  return {
    role: normalizeContributorRole(contributor.role),
    last: cleanFilenamePart(contributor.last),
    first: cleanFilenamePart(contributor.first),
  };
}

function normalizeContributors(contributors = []) {
  return contributors
    .map(normalizeContributor)
    .filter((contributor) => contributor.last || contributor.first);
}

function contributorName(contributor, invert = false) {
  const normalized = normalizeContributor(contributor);
  if (normalized.last && normalized.first) {
    return invert ? `${normalized.last}, ${normalized.first}` : `${normalized.first} ${normalized.last}`;
  }
  return normalized.last || normalized.first;
}

function joinContributorNames(contributors, invertFirst = true) {
  const names = normalizeContributors(contributors)
    .map((contributor, index) => contributorName(contributor, invertFirst && index === 0))
    .filter(Boolean);
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return invertFirst ? `${names[0]}, and ${names[1]}` : `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function primaryContributorCredit(role, contributors) {
  const names = joinContributorNames(contributors, true);
  if (!names) return "";
  const roleConfig = CONTRIBUTOR_ROLES[normalizeContributorRole(role)];
  if (!roleConfig?.primarySingle) return names;
  const suffix = normalizeContributors(contributors).length > 1 ? roleConfig.primaryPlural : roleConfig.primarySingle;
  return `${names}, ${suffix}`;
}

function secondaryContributorCredit(role, contributors) {
  const names = joinContributorNames(contributors, false);
  const label = CONTRIBUTOR_ROLES[normalizeContributorRole(role)]?.secondary;
  return names && label ? `${label} ${names}` : "";
}

function isSourceCodeCandidate(value) {
  const code = normalizeSourceCode(value);
  if (!/[0-9]/.test(code)) return false;
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(code)) return false;
  const segments = code.split("-");
  return code.length <= 14 && segments.length <= 4 && segments.some((segment) => segment.length <= 2);
}

function addSourceCode(codes, value) {
  const code = normalizeSourceCode(value);
  if (code && isSourceCodeCandidate(code) && !codes.includes(code)) {
    codes.push(code);
  }
}

function extractFilenameIdentifiers(value) {
  let text = stripBookmarkedSuffix((value || "").normalize("NFC").replace(/\.pdf$/i, ""));
  const slugged = !/\s/.test(text);
  let mmsId = "";
  let oclc = "";
  const sourceCodes = [];

  text = text.replace(/[\s_-]+(\d{1,3}\.\d{3,5})[.\s]*$/, (match, code) => {
    sourceCodes.push(code); return " ";
  });

  text = text.replace(/\b(?:oclc|ocn)\b[\s:_-]*(\d{6,})\b/gi, (match, id) => {
    if (!oclc) oclc = id;
    return " ";
  });

  text = text.replace(/\bmms[\s_-]*id\b[\s:_-]*(\d{12,})(?:[\s_-]+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+))?/gi, (match, id, code) => {
    if (!mmsId) mmsId = id;
    if (code) addSourceCode(sourceCodes, code);
    return " ";
  });

  text = text.replace(/\b(\d{12,})(?:[-_\s]+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+))?\b/g, (match, id, code) => {
    if (!mmsId) {
      mmsId = id;
    }
    if (code) addSourceCode(sourceCodes, code);
    return " ";
  });

  text = text.replace(/\b(\d{6,11})\b/g, (match, id) => {
    if (!oclc) {
      oclc = id;
      return " ";
    }
    return id;
  });

  text = text.replace(/\b([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\b/g, (match, code) => {
    if (isSourceCodeCandidate(code)) {
      addSourceCode(sourceCodes, code);
      return " ";
    }
    return match;
  });

  return {
    text: text.replace(slugged ? /[_-]+/g : /_+/g, " ").replace(/\s+/g, " ").replace(/^[\s.,-]+|[\s.,-]+$/g, ""),
    mmsId,
    oclc,
    sourceCode: sourceCodes[0] || "",
  };
}

function joinMetadataParts(...parts) {
  return parts
    .map((part) => cleanFilenamePart(part))
    .filter(Boolean)
    .join(": ");
}

function equivalentText(a, b) {
  const normalize = (value) => cleanFilenamePart(value).toLocaleLowerCase();
  return normalize(a) && normalize(a) === normalize(b);
}

function bracketedEquivalent(original, equivalent) {
  const base = cleanFilenamePart(original);
  const bracket = cleanFilenamePart(equivalent);
  if (!base) return bracket;
  if (!bracket || equivalentText(base, bracket)) return base;
  return `${base} [${bracket}]`;
}

function containsNonLatinLetters(value) {
  for (const char of cleanFilenamePart(value)) {
    if (/\p{L}/u.test(char) && !/\p{Script=Latin}/u.test(char)) return true;
  }
  return false;
}

function suggestedTitleValue(metadata) {
  const original = joinMetadataParts(metadata?.title_original, metadata?.subtitle_original);
  const english = joinMetadataParts(metadata?.title_english, metadata?.subtitle_english);
  if (containsNonLatinLetters(original)) return bracketedEquivalent(original, english);
  return original || english;
}

function suggestedAuthorDisplay(metadata) {
  const original = cleanFilenamePart(metadata?.author_original);
  const romanized = cleanFilenamePart(metadata?.author_romanized);
  const westernName = joinMetadataParts(metadata?.author_first, metadata?.author_last).replace(/: /g, " ");
  if (containsNonLatinLetters(original)) return bracketedEquivalent(original, romanized);
  return original || westernName || romanized;
}

function metadataCreatorRoleIsContributor(metadata) {
  const role = cleanFilenamePart(metadata?.creator_role).toLowerCase();
  return !role || ["author", "editor", "compiler"].includes(role);
}

function contributorRoleFromMetadata(metadata) {
  const role = cleanFilenamePart(metadata?.creator_role).toLowerCase();
  if (role.includes("edit")) return "editor";
  if (role.includes("compil")) return "compiler";
  if (!role || role.includes("author")) return "author";
  return "";
}

function contributorRoleFromMetadataContributor(contributor) {
  const role = cleanFilenamePart(contributor?.role).toLowerCase();
  if (role.includes("edit")) return "editor";
  if (role.includes("compil")) return "compiler";
  if (!role || role.includes("author")) return "author";
  return "";
}

function suggestedContributor(metadata) {
  const role = contributorRoleFromMetadata(metadata);
  if (!role) return null;
  if (metadata.is_english === false) {
    return { role, last: suggestedAuthorDisplay(metadata), first: "" };
  }
  if (cleanFilenamePart(metadata.author_last) || cleanFilenamePart(metadata.author_first)) {
    return {
      role,
      last: metadata.author_last || suggestedAuthorDisplay(metadata),
      first: metadata.author_first || "",
    };
  }
  return { role, last: suggestedAuthorDisplay(metadata), first: "" };
}

function suggestedContributorFromMetadataContributor(contributor, metadata) {
  const role = contributorRoleFromMetadataContributor(contributor);
  if (!role) return null;
  const original = cleanFilenamePart(contributor?.name_original);
  const romanized = cleanFilenamePart(contributor?.name_romanized);
  const first = cleanFilenamePart(contributor?.first);
  const last = cleanFilenamePart(contributor?.last);
  if (metadata?.is_english === false && containsNonLatinLetters(original)) {
    return { role, last: bracketedEquivalent(original, romanized), first: "" };
  }
  if (last || first) {
    return { role, last: last || original || romanized, first };
  }
  return { role, last: original || romanized, first: "" };
}

function suggestedContributors(metadata) {
  const contributors = Array.isArray(metadata?.contributors)
    ? metadata.contributors
      .map((contributor) => suggestedContributorFromMetadataContributor(contributor, metadata))
      .filter(Boolean)
      .filter((contributor) => cleanFilenamePart(contributor.last) || cleanFilenamePart(contributor.first))
    : [];
  const primaryContributors = contributors.filter((contributor) => ["author", "editor"].includes(contributor.role));
  if (primaryContributors.length) return primaryContributors;
  const compilerContributors = contributors.filter((contributor) => contributor.role === "compiler");
  if (compilerContributors.length) return compilerContributors;

  const legacyContributor = suggestedContributor(metadata);
  if (!legacyContributor) return [];
  return cleanFilenamePart(legacyContributor.last) || cleanFilenamePart(legacyContributor.first)
    ? [legacyContributor]
    : [];
}

function metadataHasVisibleEvidence(metadata) {
  const page = Number(metadata?.evidence_page);
  return Number.isFinite(page) && page > 0 && cleanFilenamePart(metadata?.evidence).length >= 8;
}
/** Bind the existing form-oriented formatter to supplied values, without reformatting it. */
export function buildFilename(values = {}) {
  const els = Object.fromEntries(["title", "mmsId", "oclc", "sourceCode"]
    .map((field) => [field, {value: values[field] || ""}]));
  const getContributorsFromForm = () => normalizeContributors(values.contributors || []);

function buildContributorCredits() {
  const contributors = getContributorsFromForm();
  const byRole = CONTRIBUTOR_ROLE_ORDER.reduce((groups, role) => {
    groups[role] = contributors.filter((contributor) => contributor.role === role);
    return groups;
  }, {});

  if (byRole.author.length) {
    return {
      primary: joinContributorNames(byRole.author, true),
      afterTitle: ["editor"]
        .map((role) => secondaryContributorCredit(role, byRole[role] || []))
        .filter(Boolean),
    };
  }

  const primaryRole = byRole.editor.length ? "editor" : (byRole.compiler.length ? "compiler" : "");
  if (!primaryRole) return { primary: "", afterTitle: [] };

  return {
    primary: primaryContributorCredit(primaryRole, byRole[primaryRole]),
    afterTitle: [],
  };
}

function buildOutputFilename() {
  const contributorCredits = buildContributorCredits();
  const title = cleanFilenamePart(els.title.value) || "Untitled";
  const mmsId = normalizeIdentifier(els.mmsId.value);
  const oclc = cleanFilenamePart(els.oclc.value);
  const sourceCode = normalizeSourceCode(els.sourceCode.value);
  const identifiers = [];
  if (mmsId) identifiers.push(`MMS ID ${mmsId}`);
  if (oclc) identifiers.push(`OCLC ${oclc}`);
  if (sourceCode) identifiers.push(sourceCode);
  const pieces = [
    contributorCredits.primary,
    title,
    ...contributorCredits.afterTitle,
    identifiers.join(", "),
  ].filter(Boolean);
  let base = pieces.join(". ").replace(/\.\s*\./g, ".").trim();
  base = base.replace(/\s+\./g, ".").replace(/\s+/g, " ");

  return `${base} [Bookmarked].pdf`;
}

  return buildOutputFilename();
}

/** Match live automatic suggestions; user edits are applied by the review form afterward. */
export function defaultNamingMetadata(sourceFilename = "", observation = {}) {
  const identifiers = extractFilenameIdentifiers(sourceFilename);
  const values = {title: identifiers.text, contributors: [], mmsId: identifiers.mmsId,
    oclc: identifiers.oclc, sourceCode: identifiers.sourceCode,
    namingSource: identifiers.text ? "source_filename" : "missing"};
  if (!observation || observation.error
      || !["high", "medium"].includes(cleanFilenamePart(observation.confidence).toLowerCase())
      || !metadataHasVisibleEvidence(observation)) return values;
  const observedTitle = suggestedTitleValue(observation);
  if (observedTitle) {
    values.title = observedTitle; values.contributors = suggestedContributors(observation);
    values.namingSource = "title_page";
  }
  return values;
}

export {cleanFilenamePart, normalizeIdentifier, normalizeSourceCode, extractFilenameIdentifiers};
