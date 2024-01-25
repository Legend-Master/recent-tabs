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
 */
function shiftItemToFront(array, item) {
	const i = array.indexOf(item)
	if (i === -1) {
		return false
	}
	for (let j = i; j > 0; j--) {
		array[j] = array[j - 1]
	}
	array[0] = item
	return true
}

/**
 * @param {number} tabId
 * @param {number} windowId
 */
async function bringTabToFront(tabId, windowId) {
	const tabsHistory = await getTabHistory()
	let history = tabsHistory[windowId]
	if (!history) {
		history = []
		tabsHistory[windowId] = history
	}
	const tabInHistory = shiftItemToFront(history, tabId)
	if (!tabInHistory) {
		history.unshift(tabId)
	}
	await setTabHistory(tabsHistory)
}

chrome.tabs.onCreated.addListener(async (tab) => {
	if (!tab.id) {
		return
	}
	bringTabToFront(tab.id, tab.windowId)
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
	for (let i = 0; i < history.length; i++) {
		if (history[i] === tabId) {
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
			// return
		}
	}
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
