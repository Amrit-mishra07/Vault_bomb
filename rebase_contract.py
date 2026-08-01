import sys
with open(sys.argv[1], 'r') as f:
    lines = f.readlines()
# lines format: pick <hash> <msg>
# We want to reorder and change to fixup
# Original:
# pick 4ac1f07 feat
# pick 2edb1a2 fix
# pick 6deab7b test
# pick 8b78286 refactor
# New:
# pick 4ac1f07 feat
# fixup 2edb1a2 fix
# fixup 8b78286 refactor
# pick 6deab7b test
new_lines = []
feat_line = next(l for l in lines if '4ac1f07' in l)
fix_line = next(l for l in lines if '2edb1a2' in l).replace('pick', 'fixup')
refactor_line = next(l for l in lines if '8b78286' in l).replace('pick', 'fixup')
test_line = next(l for l in lines if '6deab7b' in l)

new_lines = [feat_line, fix_line, refactor_line, test_line]
with open(sys.argv[1], 'w') as f:
    f.writelines(new_lines)
