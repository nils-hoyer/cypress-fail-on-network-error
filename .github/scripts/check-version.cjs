// Fails when package.json's version is not exactly one patch, minor or
// major step above the version on the base branch. Usage:
// node check-version.cjs <base version> <head version>
const [base, head] = process.argv.slice(2);

if (base === head) {
    console.log(`Version unchanged (${head}): no release.`);
    process.exit(0);
}

const [major, minor, patch] = base.split('.').map(Number);
const allowed = [
    `${major + 1}.0.0`,
    `${major}.${minor + 1}.0`,
    `${major}.${minor}.${patch + 1}`,
];

if (!allowed.includes(head)) {
    console.error(
        `Version ${base} -> ${head} is not one step. Use one of: ${allowed.join(', ')}.`
    );
    process.exit(1);
}

console.log(`Version ${base} -> ${head}: merging publishes a release.`);
