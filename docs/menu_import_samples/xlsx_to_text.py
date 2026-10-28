# ブラウザで SheetJS の sheet_to_csv がやるのと同じく、シートごとに CSV にする（結合セルは左上だけ値が入る）
import csv, io, sys
import openpyxl

def to_text(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator='\n')
        for row in ws.iter_rows(values_only=True):
            cells = ['' if v is None else (f'{v:g}' if isinstance(v, float) else str(v)) for v in row]
            while cells and cells[-1] == '':
                cells.pop()
            w.writerow(cells)
        out.append(f'### シート: {ws.title}\n{buf.getvalue().rstrip()}')
    return '\n\n'.join(out)

if __name__ == '__main__':
    print(to_text(sys.argv[1]))
