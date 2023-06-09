import { WEBFLOW_KEY, WEBFLOW_COLLECTION } from '$env/static/private'

const WEBFLOW_API_URL = `https://api.webflow.com/collections/${WEBFLOW_COLLECTION}/items`

export async function getWebflowArticles() {
	const response = await fetch(`${WEBFLOW_API_URL}?access_token=${WEBFLOW_KEY}`, {
		headers: {
			accept: 'application/json'
		},
		method: 'GET'
	})
	return parseArticles(await response.json())
}

function parseArticles(articles) {
	return articles.items.reduce((acc, item) => {
		const { slug, _draft, _archived, content, name } = item
		if (!_draft && !_archived) {
			acc.push({
				slug,
				name,
				content: content.replace(/<[^>]+>/g, '').replace(/&nbsp;‍/, ' ')
			})
		}
		return acc
	}, [])
}
