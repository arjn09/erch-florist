const config = {
     spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1wdnUtUUBzbwFL-tztvsePpmIRvPKhrspu3gr1c9iXxk/edit?usp=sharing',
    webAppUrl: 'https://script.google.com/macros/s/AKfycbwzhTbhB8-oZaOvCVbn6gntOXfC9cfM1E7ah1V-vnYBqIpANiLlvSpS4RqLtRPVtIqu/exec'
};

let orders = [];

function init() {
    document.getElementById('tanggalKirim').value = new Date().toISOString().split('T')[0];
    ['hargaBahan','hargaStiker','hargaPapan'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
    toggleHargaBahan();
    updatePreview();
    loadFromSheets();
}

function applyModelPrice() {
    const keterangan = document.getElementById('keterangan').value;
    const select = document.getElementById('modelPapan');
    const selectedOption = select.options[select.selectedIndex];
    const harga = selectedOption.getAttribute('data-harga');

    // Harga otomatis hanya berlaku untuk Sewa. Untuk Beli, harga diisi manual (custom).
    if (keterangan === 'Sewa' && harga) {
        document.getElementById('hargaPapan').value = harga;
    } else if (keterangan === 'Sewa') {
        document.getElementById('hargaPapan').value = '';
    }
    updatePreview();
}

function toggleHargaBahan() {
    const keterangan = document.getElementById('keterangan').value;
    const group = document.getElementById('hargaBahanGroup');
    const input = document.getElementById('hargaBahan');

    if (keterangan === 'Beli') {
        group.style.display = 'block';
        document.getElementById('hargaPapan').value = ''; // Beli = harga custom, isi manual
    } else {
        group.style.display = 'none';
        input.value = 0; // reset supaya tidak ikut kehitung saat disembunyikan
        applyModelPrice(); // Sewa = harga otomatis sesuai model yang dipilih
    }
    updatePreview();
}

function showToast(msg, dur=2500) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), dur);
}

function openTab(name) {
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(name).classList.add('active');
    event.target.classList.add('active');
}

function formatCurrency(n) {
    return 'Rp ' + (n||0).toLocaleString('id-ID');
}

// Membersihkan format jam/tanggal jika masih terbawa format ISO teknis
// (jaga-jaga jika Apps Script belum di-update ke getDisplayValues)
function cleanTimeValue(val) {
    if (!val) return '-';
    const isoMatch = String(val).match(/T(\d{2}):(\d{2}):\d{2}/);
    if (isoMatch) return isoMatch[1] + ':' + isoMatch[2];
    return val;
}

function cleanDateValue(val) {
    if (!val) return '-';
    const isoMatch = String(val).match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
    return val;
}

function updatePreview() {
    const bahan = parseFloat(document.getElementById('hargaBahan').value) || 0;
    const stiker = parseFloat(document.getElementById('hargaStiker').value) || 0;
    const papan = parseFloat(document.getElementById('hargaPapan').value) || 0;
    const total = papan - bahan - stiker;
    document.getElementById('totalPreview').textContent = formatCurrency(total);
}

function openSpreadsheet() {
    window.open(config.spreadsheetUrl, '_blank');
}

document.getElementById('orderForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const bahan = parseFloat(document.getElementById('hargaBahan').value) || 0;
    const stiker = parseFloat(document.getElementById('hargaStiker').value) || 0;
    const papan = parseFloat(document.getElementById('hargaPapan').value) || 0;
    const total = papan - bahan - stiker;

    const order = {
        tanggalKirim: document.getElementById('tanggalKirim').value,
        keterangan: document.getElementById('keterangan').value,
        namaPemesan: document.getElementById('namaPemesan').value,
        modelPapan: document.getElementById('modelPapan').value,
        lokasi: document.getElementById('lokasi').value,
        jam: document.getElementById('jam').value,
        hargaBahan: bahan,
        hargaStiker: stiker,
        hargaPapan: papan,
        total: total
    };

    showToast('💾 Menyimpan...');

    try {
        await fetch(config.webAppUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ type: 'order', ...order })
        });

        orders.push(order);
        renderTable();
        this.reset();
        document.getElementById('tanggalKirim').value = new Date().toISOString().split('T')[0];
        updatePreview();
        showToast('✅ Pesanan tersimpan!');
    } catch(err) {
        console.error(err);
        showToast('❌ Gagal menyimpan, cek koneksi');
    }
});

async function loadFromSheets() {
    showToast('⏳ Memuat data...');
    try {
        const res = await fetch(config.webAppUrl + '?type=order');
        const rows = await res.json();

        orders = rows.map(r => ({
            tanggalKirim: r[0],
            keterangan: r[1],
            namaPemesan: r[2],
            modelPapan: r[3],
            lokasi: r[4],
            jam: r[5],
            hargaBahan: parseFloat(r[6]) || 0,
            hargaStiker: parseFloat(r[7]) || 0,
            hargaPapan: parseFloat(r[8]) || 0,
            total: parseFloat(r[9]) || 0
        }));

        populateMonthFilter();
        renderTable();
        showToast('✅ Data dimuat!');
    } catch(err) {
        console.error(err);
        showToast('⚠️ Belum ada data / cek koneksi');
        populateMonthFilter();
        renderTable();
    }
}

const NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// Ambil kunci "YYYY-MM" dari tanggal, baik format "YYYY-MM-DD" maupun ISO lengkap
function getMonthKey(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return `${match[1]}-${match[2]}`;
}

function populateMonthFilter() {
    const select = document.getElementById('monthFilter');
    const previousValue = select.value || 'all';

    // Kumpulkan semua bulan unik dari data, urutkan dari terbaru
    const monthKeys = [...new Set(orders.map(o => getMonthKey(o.tanggalKirim)).filter(Boolean))]
        .sort((a, b) => b.localeCompare(a));

    select.innerHTML = '<option value="all">Semua Bulan</option>' +
        monthKeys.map(key => {
            const [year, month] = key.split('-');
            const label = `${NAMA_BULAN[parseInt(month, 10) - 1]} ${year}`;
            return `<option value="${key}">${label}</option>`;
        }).join('');

    // Pertahankan pilihan bulan sebelumnya kalau masih ada di daftar
    if (monthKeys.includes(previousValue) || previousValue === 'all') {
        select.value = previousValue;
    } else {
        select.value = 'all';
    }
}

function renderTable() {
    const tbody = document.getElementById('orderTableBody');
    const selectedMonth = document.getElementById('monthFilter').value;

    const filteredOrders = selectedMonth === 'all'
        ? orders
        : orders.filter(o => getMonthKey(o.tanggalKirim) === selectedMonth);

    if (filteredOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">Belum ada data pesanan di bulan ini</td></tr>';
    } else {
        tbody.innerHTML = filteredOrders.map(o => `
            <tr>
                <td>${cleanDateValue(o.tanggalKirim)}</td>
                <td><span class="badge ${o.keterangan==='Sewa'?'badge-sewa':'badge-beli'}">${o.keterangan||'-'}</span></td>
                <td>${o.namaPemesan || '-'}</td>
                <td>${o.modelPapan || '-'}</td>
                <td>${o.lokasi || '-'}</td>
                <td>${cleanTimeValue(o.jam)}</td>
                <td>${o.hargaBahan ? formatCurrency(o.hargaBahan) : '-'}</td>
                <td>${o.hargaStiker ? formatCurrency(o.hargaStiker) : '-'}</td>
                <td>${o.hargaPapan ? formatCurrency(o.hargaPapan) : '-'}</td>
                <td style="color:#a9fca0; font-weight:700;">${formatCurrency(o.total)}</td>
            </tr>
        `).join('');
    }

    // Total untuk bulan yang sedang dipilih (tabel & kartu ringkasan bulan)
    const monthTotal = filteredOrders.reduce((s,o)=>s+(o.total||0),0);
    const monthPapan = filteredOrders.reduce((s,o)=>s+(o.hargaPapan||0),0);

    document.getElementById('footTotal').textContent = formatCurrency(monthTotal);
    document.getElementById('monthOrderCount').textContent = filteredOrders.length;
    document.getElementById('monthPapanTotal').textContent = formatCurrency(monthPapan);
    document.getElementById('monthProfitTotal').textContent = formatCurrency(monthTotal);

    // Total keseluruhan (semua bulan) untuk kartu ringkasan atas
    const totalAll = orders.reduce((s,o)=>s+(o.total||0),0);
    const totalPapanAll = orders.reduce((s,o)=>s+(o.hargaPapan||0),0);

    document.getElementById('totalProfit').textContent = formatCurrency(totalAll);
    document.getElementById('totalOrders').textContent = orders.length;
    document.getElementById('totalPapan').textContent = formatCurrency(totalPapanAll);
}

init();
