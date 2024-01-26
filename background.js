// @ts-check
const TOGGLE_COMMAND = 'toggle-tab'
const STORAGE_KEY = 'tabs-history'

/** @typedef {{[windowId: number]: number[]}} TabHistory */

/** @type {TabHistory}  */
let tabHistoryCache
const initTabHistory = (async () => {
	const stored = await chrome.storage.session.get(STORAGE_KEY)
	tabHistoryCache = stored[STORAGE_KEY] ?? {}
})()

async function getTabHistory() {
	await initTabHistory
	return tabHistoryCache
}

/**
 * @param {TabHistory} history
 */
async function setTabHistory(history) {
	await initTabHistory
	tabHistoryCache = history
	await chrome.storage.session.set({ [STORAGE_KEY]: history })
}

// /**
//  * @param {(tabsHistory: TabHistory) => void} fn
//  */
// async function updateTabsHistory(fn) {
// 	const history = await getTabHistory()
// 	fn(history)
// 	// await setTabsHistory(history)
// 	tabHistoryCache = history
// 	await chrome.storage.session.set({ [STORAGE_KEY]: history })
// }

/**
 * @template T
 * @param {T[]} array
 * @param {T} item
 * @param {number} [index=0]
 */
function shiftItemToFront(array, item, index = 0) {
	if (index > array.length - 1) {
		return false
	}
	const i = array.indexOf(item)
	if (i === -1) {
		return false
	}
	for (let j = i; j > index; j--) {
		array[j] = array[j - 1]
	}
	array[index] = item
	return true
}

/**
 * @param {number} tabId
 * @param {number} windowId
 * @param {number} [index=0]
 */
async function bringTabToFront(tabId, windowId, index = 0) {
	const tabsHistory = await getTabHistory()
	let history = tabsHistory[windowId]
	if (!history) {
		history = []
		tabsHistory[windowId] = history
	}
	const tabInHistory = shiftItemToFront(history, tabId, index)
	if (!tabInHistory) {
		history.splice(index, 0, tabId)
	}
	await setTabHistory(tabsHistory)
}

chrome.tabs.onCreated.addListener(async (tab) => {
	if (!tab.id) {
		return
	}
	// Move to the second
	bringTabToFront(tab.id, tab.windowId, 1)
})

chrome.tabs.onActivated.addListener(async (activeInfo) => {
	bringTabToFront(activeInfo.tabId, activeInfo.windowId)
})

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	if (removeInfo.isWindowClosing) {
		return
	}
	const tabsHistory = await getTabHistory()
	const history = tabsHistory[removeInfo.windowId]
	if (!history) {
		return
	}
	const i = history.indexOf(tabId)
	if (i === -1) {
		return false
	}
	for (let j = i; j < history.length - 1; j++) {
		history[j] = history[j + 1]
	}
	history.pop()
	// Try go back to the last tab in the history to override the default behavior in Chrome
	// Not a good experience when we were unloaded
	// const lastTabId = history[0]
	// if (lastTabId) {
	// 	chrome.tabs.update(lastTabId, { active: true })
	// }
	await setTabHistory(tabsHistory)
})

chrome.windows.onRemoved.addListener(async (windowId) => {
	const history = await getTabHistory()
	delete history[windowId]
	await setTabHistory(history)
})

chrome.commands.onCommand.addListener(async (command) => {
	if (command === TOGGLE_COMMAND) {
		const window = await chrome.windows.getCurrent()
		if (!window.id) {
			return
		}
		const history = await getTabHistory()
		const lastTabId = history[window.id]?.[1] // Second one in the history
		if (lastTabId) {
			chrome.tabs.update(lastTabId, { active: true })
		}
	}
})
