import {
	OPENAI_KEY,
	ELEVENLABS_VOICE,
	ELEVENLABS_KEY,
	OPENAI_ORG,
	PINECONE_API_KEY,
	PINECONE_ENVIRONMENT,
	PINECONE_INDEX
} from '$env/static/private'
import type { ChatCompletionRequestMessage, CreateChatCompletionRequest } from 'openai'
import type { RequestHandler } from './$types'
import { getTokens } from '$lib/tokenizer'
import { json } from '@sveltejs/kit'
import type { Config } from '@sveltejs/adapter-vercel'

// import { OpenAI } from 'langchain/llms/openai'

import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { ConversationalRetrievalQAChain } from 'langchain/chains'
import { CheerioWebBaseLoader } from 'langchain/document_loaders/web/cheerio'
import { RecursiveCharacterTextSplitter, TextSplitter } from 'langchain/text_splitter'
import { BufferMemory, ChatMessageHistory } from 'langchain/memory'
import { HumanChatMessage, AIChatMessage } from 'langchain/schema'
import { PineconeClient } from '@pinecone-database/pinecone'
import { PineconeStore } from 'langchain/vectorstores/pinecone'
import articles from '$lib/articles.json'

import axios from 'axios'
import { load } from 'cheerio'

const OPENAI_URL = 'https://api.openai.com/v1'
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1'

export const config: Config = {
	runtime: 'edge'
}

type Messages = {
	messages: [
		{
			role: 'user' | 'assistant' | 'system'
			content: string
		}
	]
}

/**
 * Crawl all available urls given a domain url and limit
 * @param {string} url
 * @param {number} limit
 * @returns {string[]}
 */
async function getAvailableURLs(url: string, limit: number) {
	try {
		const availableUrls: string[] = []

		console.info(`Crawling: ${url}`)
		availableUrls.push(url)

		const response = await axios.get(url)
		const $ = load(response.data)

		const relativeLinks = $("a[href^='/']")
		console.info(`Available Relative Links: ${relativeLinks.length}`)
		if (relativeLinks.length === 0) return availableUrls

		limit = Math.min(limit + 1, relativeLinks.length) // limit + 1 is because index start from 0 and index 0 is occupy by url
		console.info(`True Limit: ${limit}`)

		// availableUrls.length cannot exceed limit
		for (let i = 0; availableUrls.length < limit; i++) {
			if (i === limit) break // some links are repetitive so it won't added into the array which cause the length to be lesser
			console.info(`index: ${i}`)
			const element = relativeLinks[i]

			const relativeUrl = $(element).attr('href')
			if (!relativeUrl) continue

			const absoluteUrl = new URL(relativeUrl, url).toString()
			if (!availableUrls.includes(absoluteUrl)) {
				availableUrls.push(absoluteUrl)
				console.info(`Found unique relative link: ${absoluteUrl}`)
			}
		}

		return availableUrls
	} catch (err: any) {
		throw new Error(`getAvailableURLs: ${err?.message}`)
	}
}

async function cheerioLoader(url: string, textSplitter?: TextSplitter): Promise<any> {
	let docs = []
	const loader = new CheerioWebBaseLoader(url)
	if (textSplitter) {
		docs = await loader.loadAndSplit(textSplitter)
	} else {
		docs = await loader.load()
	}
	return docs
}

async function getPinecone() {
	const client = new PineconeClient()
	await client.init({
		apiKey: PINECONE_API_KEY,
		environment: PINECONE_ENVIRONMENT
	})

	return client.Index(PINECONE_INDEX)
}
function getOpenAIEmbedding() {
	return new OpenAIEmbeddings({ openAIApiKey: OPENAI_KEY }, { organization: OPENAI_ORG })
}
async function generateIndexes() {
	const url = 'https://its-time-to-refokus-v2.webflow.io/blog'
	const limit = '15'
	let docs = []
	const spliter = new RecursiveCharacterTextSplitter({ chunkSize: 4000, chunkOverlap: 200 })
	let availableUrls = await getAvailableURLs(url, parseInt(limit))
	for (let i = 0; i < availableUrls.length; i++) {
		console.log(`Processing URL ${availableUrls[i]}`)
		docs.push(...(await cheerioLoader(availableUrls[i], spliter)))
	}
	const pineconeIndex = await getPinecone()
	console.log(docs)
	return PineconeStore.fromDocuments(docs, getOpenAIEmbedding(), {
		pineconeIndex,
		namespace: 'refokus-blog'
	})
}

async function getIndexes() {
	const pineconeIndex = await getPinecone()
	return PineconeStore.fromExistingIndex(getOpenAIEmbedding(), {
		pineconeIndex,
		namespace: 'refokus-blog'
	})
}
function serializeChatHistory(history) {
	const pastMessages = [
		new HumanChatMessage('What are you? How were you built?'),
		new AIChatMessage(
			'I’m an AI built by Refokus with GPT and trained with Refokus library. In other words, I’m AI employee #1 at Refokus. Do you want to know more about Refokus?'
		),
		new HumanChatMessage('What is Refokus Library?'),
		new AIChatMessage(
			'Just a fancy name to our blog, where we write about the new breed of agency we are creating. Is there a topic you are interested in knowing more about?'
		),
		new HumanChatMessage('What can you do?'),
		new AIChatMessage(
			'I can answer you questions about Refokus Library and help you navigate our ideas.'
		),
		new HumanChatMessage('How were you built?'),
		new AIChatMessage('I was built by Refokus, using GPT. Do you want to know more about Refokus?'),
		new HumanChatMessage('What topics can I ask you about?'),
		new AIChatMessage(
			'You can ask me about the new breed of agency Refokus is building. Some topics we write about are emerging tech (like AI, or no-code), new models of working in the digital world, the future of agencies, and stuff like that. Is there a topic you are interested in knowing more about? (keep answering only about the data that I provided you, do not answer questions that are not related, be assertive, do not response more than 2th sentence. Remember to answer as JSON, do not fill the article property if your answer is not related to one article)'
		),
		new HumanChatMessage('Explain quantum computing in simple terms'),
		new AIChatMessage("I can't answer that question")
	]
	for (const message of history) {
		switch (message.role) {
			case 'user':
				pastMessages.push(new HumanChatMessage(message.content))
				break
			case 'assistant':
				pastMessages.push(new AIChatMessage(message.content))
				break
		}
	}

	return new ChatMessageHistory(pastMessages)
}
export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!OPENAI_KEY) {
			throw new Error('OPENAI_KEY env variable not set')
		}

		const requestData: Messages = await request.json() // messages[]

		if (!requestData) {
			throw new Error('No request data')
		}

		const reqMessages: ChatCompletionRequestMessage[] = requestData.messages

		if (!reqMessages) {
			throw new Error('No messages provided')
		}

		let tokenCount = 0
		reqMessages.forEach((msg) => {
			const tokens = getTokens(msg.content)
			tokenCount += tokens
		})

		console.info(`User promps:`, reqMessages[reqMessages.length - 1])
		// To generate indexes in pinecone
		//const store = await generateIndexes()

		// to get indexes from pinecone
		const store = await getIndexes()

		const condenseTemplate = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.
		You can assume the question about the Refokus' article database.

		Chat History:
		{chat_history}
		Follow Up Input: {question}
		Standalone question:`

		const template = `You are a librarian AI assistant built by Refokus that helps people search Refokus article database. 
		You are given the following extracted parts of a long list of articles and a question. Provide a conversational answer.
		The provided context represents Refokus' blog articles. 
		Only use the data provided to answer new questions. Do not answer anything that is not related to it. 
		If you don't know the answer, just say "Hmm, I'm not sure." 
		Be assertive, do not response more than 2 sentence.
		If the question is not about the articles inside Refokus database, politely inform them that you are tuned to only answer questions about Refokus' database.
		Your answer must be in a valid JSON. The property "answer" must have your answer and the property "article" must have the url of the article that you are talking about

		Use the following pieces of context to answer the question at the end.

		=========
		{context}
		=========

		Question: {question}
		Helpful JSON Answer:
		`
		// const template = `You are a helpful AI customer support agent. Use the following pieces of context to answer the question at the end.
		// If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
		// If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

		// {context}

		// Question: {question}
		// Helpful answer:`
		const model = new ChatOpenAI(
			{ openAIApiKey: OPENAI_KEY, temperature: 0.4, modelName: 'gpt-3.5-turbo' },
			{ organization: OPENAI_ORG }
		)
		const question = reqMessages.pop()

		const chain = ConversationalRetrievalQAChain.fromLLM(model, store.asRetriever(), {
			qaTemplate: template,
			questionGeneratorTemplate: condenseTemplate,
			memory: new BufferMemory({
				memoryKey: 'chat_history', // Must be set to "chat_history"
				inputKey: 'question',
				outputKey: 'output',
				chatHistory: serializeChatHistory(reqMessages)
			})
		})

		// chain.questionGeneratorChain.llm = model

		// Select the relevant documents
		// const relevantDocs = await store.similaritySearch(question)
		const obj = {
			question: question?.content
		}
		// Call the chain
		const res = await chain.call(obj)
		let answerObj
		try {
			let text = res.text
			console.info(`chatGPT asnwer: ${text}`)
			if (!text.match(/^{\n?\t?\"answer\"/)) {
				text = text.replace(/\s*\n*\t*[^\{]*/, '')
			}
			answerObj = JSON.parse(text)
		} catch (e) {
			answerObj = {
				answer: res.text,
				article: ''
			}
		}

		if (!answerObj.article?.match(/^http/)) {
			console.log(`Article slug to fix: ${answerObj.article}`)
			answerObj.article = ''
		}

		return new Response(JSON.stringify(answerObj), {
			headers: { 'Content-Type': 'application/json' }
		})
	} catch (err) {
		console.log(err)
		return json(
			{ error: 'There was an error processing your request. Try again.' },
			{ status: 500 }
		)
	}
}
