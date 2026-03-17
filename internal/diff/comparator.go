package diff

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/sergi/go-diff/diffmatchpatch"
)

type DiffResult struct {
	Diffs     []DiffLine `json:"diffs"`
	Added     int        `json:"added"`
	Removed   int        `json:"removed"`
	Unchanged int        `json:"unchanged"`
}

type DiffLine struct {
	Type    string `json:"type"`    // "equal"|"insert"|"delete"
	Content string `json:"content"`
	LineA   int    `json:"line_a"`
	LineB   int    `json:"line_b"`
}

type CompareOptions struct {
	IgnorePatterns []string // regex patterns to ignore
	IgnoreCase     bool
}

// Compare performs a line-based diff between two texts
func Compare(textA, textB string, opts CompareOptions) (*DiffResult, error) {
	if opts.IgnoreCase {
		textA = strings.ToLower(textA)
		textB = strings.ToLower(textB)
	}

	// Apply ignore patterns
	linesA := applyIgnore(strings.Split(textA, "\n"), opts.IgnorePatterns)
	linesB := applyIgnore(strings.Split(textB, "\n"), opts.IgnorePatterns)

	cleanA := strings.Join(linesA, "\n")
	cleanB := strings.Join(linesB, "\n")

	dmp := diffmatchpatch.New()
	diffs := dmp.DiffMain(cleanA, cleanB, true)
	diffs = dmp.DiffCleanupSemantic(diffs)

	result := &DiffResult{}
	lineA := 1
	lineB := 1

	for _, d := range diffs {
		lines := strings.Split(d.Text, "\n")
		// Remove trailing empty from split
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
		for _, line := range lines {
			var diffType string
			switch d.Type {
			case diffmatchpatch.DiffEqual:
				diffType = "equal"
				result.Unchanged++
				result.Diffs = append(result.Diffs, DiffLine{Type: diffType, Content: line, LineA: lineA, LineB: lineB})
				lineA++
				lineB++
			case diffmatchpatch.DiffInsert:
				diffType = "insert"
				result.Added++
				result.Diffs = append(result.Diffs, DiffLine{Type: diffType, Content: line, LineB: lineB})
				lineB++
			case diffmatchpatch.DiffDelete:
				diffType = "delete"
				result.Removed++
				result.Diffs = append(result.Diffs, DiffLine{Type: diffType, Content: line, LineA: lineA})
				lineA++
			}
		}
	}

	return result, nil
}

func applyIgnore(lines []string, patterns []string) []string {
	if len(patterns) == 0 {
		return lines
	}
	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		r, err := regexp.Compile(p)
		if err == nil {
			compiled = append(compiled, r)
		}
	}
	var result []string
	for _, line := range lines {
		ignored := false
		for _, r := range compiled {
			if r.MatchString(line) {
				ignored = true
				break
			}
		}
		if !ignored {
			result = append(result, line)
		}
	}
	return result
}

// Summary returns a human-readable summary of the diff
func (r *DiffResult) Summary() string {
	return fmt.Sprintf("+%d -%d =%d lines", r.Added, r.Removed, r.Unchanged)
}
