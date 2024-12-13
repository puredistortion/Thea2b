#!/bin/bash

# Define file path
ERROR_FILE="/Users/ctb_ceo/Desktop/errors1.txt"

# Get terminal content using osascript with proper window targeting
osascript <<EOF > "$ERROR_FILE"
tell application "Terminal"
    -- Get list of windows in reverse order (most recent first)
    set allWindows to (reverse of windows)
    
    if (count of allWindows) > 0 then
        -- Get the first (most recent) window's content
        get contents of item 1 of allWindows
    else
        return "No Terminal windows found"
    end if
end tell
EOF

# Close any window that's accessing errors1.txt
osascript <<EOF
tell application "Finder"
    set errorFile to POSIX file "/Users/ctb_ceo/Desktop/errors1.txt" as alias
    
    -- Close any window showing the file's parent folder
    close window of folder of errorFile
    
    -- If TextEdit or any other app has it open
    tell application "System Events"
        set appsList to name of application processes
        if appsList contains "TextEdit" then
            tell application "TextEdit"
                close (every document whose path is "/Users/ctb_ceo/Desktop/errors1.txt") saving no
            end tell
        end if
    end tell
end tell
EOF

echo "Terminal content has been captured to $ERROR_FILE"