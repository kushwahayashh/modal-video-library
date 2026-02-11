# Frontend File Manager Page (`client/src/FileManager.tsx`)

## Main Responsibilities
- List files/folders for current path.
- Navigate folder hierarchy with breadcrumbs.
- Trigger rename and delete operations.
- Provide lightweight loading and empty states.

## State Model
- `currentPath`: active relative path under data root.
- `files`: current directory listing.
- `loading`: fetch in-flight indicator.
- `selectedFile`: file/folder selected for modal action.
- `modal`: active modal type (`rename` or `delete`).
- `renameValue`: current rename input value.

## API Integration
- List directory: `GET /api/files?path=...`
- Rename: `POST /api/files/rename` with `{ oldPath, newPath }`
- Delete: `DELETE /api/files/<encoded path>`

## Behavior Details
- Root path represented as empty string in state.
- Breadcrumbs are derived by splitting current path on `/`.
- Folder rows are clickable for navigation.
- Action buttons stop click propagation to avoid accidental navigation.
- Enter confirms rename; Escape closes modal.

## Failure Handling
- Fetch failures clear list to empty.
- Rename/delete failures display in-page toast messages.
