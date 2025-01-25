function getGeniusRankProfileCardHTML() {
    return `
        <div id="biliscope-id-card" style="position: absolute;padding:20px;">
            <div id="biliscope-id-card-data">
            <div class="idc-content">
                <b id="GeniuseRanktitle" class="idc-uname">排名信息</b>
                

            </div>
            <div id="rank-info"></div>
            </div>
        </div>
    `
}


function GeniusRankProfileCard() {
    this.dataId = null;
    this.data = {};
    this.cursorX = 0;
    this.cursorY = 0;
    this.target = null;
    this.enabled = false;
    this.wordCloud = null;
    this.lastDisable = 0;
    this.el = document.createElement("div");
    this.el.style.position = "absolute";
    this.el.innerHTML = getGeniusRankProfileCardHTML(); //this.data
    this.disable();
    document.body.appendChild(this.el);
}
GeniusRankProfileCard.prototype.enable = function (dataId) {
    if (dataId != null && dataId != this.dataId) {
        this.enabled = true;
        return true;
    }
    return false;
}

GeniusRankProfileCard.prototype.hide = function () {
    this.el.style.display = "none";
}

GeniusRankProfileCard.prototype.disable = function () {
    this.dataId = null;
    this.enabled = false;
    if (this.el) {
        this.el.style.display = "none";
    }
}

GeniusRankProfileCard.prototype.updateCursor = function (cursorX, cursorY) {
    const cursorPadding = 10;
    const windowPadding = 20;

    this.cursorX = cursorX;
    this.cursorY = cursorY;

    if (this.el) {
        let width = this.el.scrollWidth;
        let height = this.el.scrollHeight;

        if (this.cursorX + width + windowPadding > window.scrollX + window.innerWidth) {
            // Will overflow to the right, put it on the left
            this.el.style.left = `${this.cursorX - cursorPadding - width}px`;
        } else {
            this.el.style.left = `${this.cursorX + cursorPadding}px`;
        }

        if (this.cursorY + height + windowPadding > window.scrollY + window.innerHeight) {
            // Will overflow to the bottom, put it on the top
            if (this.cursorY - windowPadding - height < window.scrollY) {
                // Can't fit on top either, put it in the middle
                this.el.style.top = `${window.scrollY + (window.innerHeight - height) / 2}px`;
            } else {
                this.el.style.top = `${this.cursorY - cursorPadding - height}px`;
            }
        } else {
            this.el.style.top = `${this.cursorY + cursorPadding}px`;
        }
    }
}

GeniusRankProfileCard.prototype.updateDataId = function (dataId, data, savedTimestamp, dataHtml) {
    this.dataId = dataId;
    this.data = data;
    this.savedTimestamp = savedTimestamp;
    this.dataHtml = dataHtml;
}

GeniusRankProfileCard.prototype.updateTarget = function (target) {
    this.target = target;
    upc = this
    this.target.addEventListener("mouseleave", function leaveHandle(ev) {
        upc.disable();
        upc.lastDisable = Date.now();
        this.removeEventListener("mouseleave", leaveHandle);
    })
}
GeniusRankProfileCard.prototype.updateData = function () {
    this.el.innerHTML = getGeniusRankProfileCardHTML();
    this.el.style.display = "flex";

    document.getElementById("GeniuseRanktitle").innerHTML = `${this.dataId} 排名信息`;
    document.getElementById("rank-info").innerHTML = this.dataHtml;



}
geniusRankProfileCard = new GeniusRankProfileCard();