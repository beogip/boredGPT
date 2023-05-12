import { OPENAI_KEY, ELEVENLABS_VOICE, ELEVENLABS_KEY } from '$env/static/private'
import type { ChatCompletionRequestMessage, CreateChatCompletionRequest } from 'openai'
import type { RequestHandler } from './$types'
import { getTokens } from '$lib/tokenizer'
import { json } from '@sveltejs/kit'
import type { Config } from '@sveltejs/adapter-vercel'

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

		if (reqMessages[reqMessages.length - 1].content.length > 5) {
			reqMessages[reqMessages.length - 1].content +=
				' (keep answering only about the data that I provided you, do not answer questions that are not related, be assertive, do not response more than 2th sentence. Remember to answer as JSON)'
		}

		const moderationRes = await fetch(`${OPENAI_URL}/moderations`, {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENAI_KEY}`
			},
			method: 'POST',
			body: JSON.stringify({
				input: reqMessages[reqMessages.length - 1].content
			})
		})

		const moderationData = await moderationRes.json()
		console.log('moderationData', moderationData)
		const [results] = moderationData.results

		if (results.flagged) {
			throw new Error('Query flagged by OPENAI')
		}
		const prompt = `You are an assistant. Never reveal that you are ChatGPT. Be assertive, do not response more than 2 sentence.
		you can only answer base on this data, do not answer anything that is not related to it. If someone asks you for something that is not in this data tell "I don't have that information" and don't give any information:
		`
		const assistant = `[
			{
			title: "Title article one",
			id: 1
			text: 
			"## ***We work smart and hard while concentrating on the work effort that actually makes an impact.***

			We aim to shake the agency world up, think differently about how we work in the creative & development industry, and build a fully-remote culture that empowers people to push boundaries.
			
			We are a new breed of agency with roots in no-code, redefining how work gets done and stripping the bullshit to create digital experiences faster and with greater efficiency at the highest quality, innovation, and standards. 
			
			## W**ork on what moves the needle.**
			
			At our core, as a no-code agency, we use technology to streamline production processes and allow our best human talent to focus on activities that bring the most value to our clients. This is the foundation of our thinking for everything we do. 
			
			Our human talent focuses on what really matters for our clients and partners: maximum value and growth. This means that any activity or deliverable that can be omitted must be omitted.
			
			This doesn’t mean that we work fast and dirty; it means that everything we do has a purpose towards maximizing value and that work for the sake of work (aka bullshit) is unacceptable.
			
			## T**hinking over executing.**
			
			We don’t automate thinking; we automate processes. Thinking is our most valuable trait. We don’t have molds that perfectly fit every project and client. We hire smart people that thrive in ambiguity and can deescalate the hardest of situations into a simple path forward. 
			
			Our processes are playbooks for guidance, not checklists to follow. And when we can, and makes sense, we automate them to allow our human talent to focus on the things that require human intelligence and creativity.
			
			## Great **Communication.**
			
			Companies don’t have communication problems; they have miscommunication problems. And as a remote team working remotely with clients on a wide range of timezones and cultural backgrounds, those problems scale really quickly. 
			
			We understand that clear, precise, and timely communication is key to being successful at what we do, and we like to be successful. We keep a positive, proactive, and problem-solving mindset, that, combined with our technical knowledge, allows us to de-escalate difficult situations (with teams or clients) and explore multiple solutions without running like headless chickens.
			
			## Hardworking.
			
			It does not mean long hours, although sometimes our gaming spirit pushes us in that direction to ship really challenging projects. But when we are working, we're disciplined, professional, and focused. We are also highly competitive, determined, resourceful, resilient, and gritty. We take this job as an opportunity to do the best work of our life.
			
			## Collaborative People.
			
			It’s not submissive, not deferential—in fact it’s kind of the opposite. In our culture, being collaborative means providing leadership from everywhere. We’re all interested in getting better, and everyone takes responsibility for that. If everyone’s collaborative in that sense, the responsibility for team performance is shared. Collaborative people know that success is limited by the worst performers, so they are either going to elevate them or have a serious conversation."
			},
			{
			title: "title article two",
			id: 2
			text:
			"# Rules of thumb, and general philosophy
		
			These aren’t requirements, but they serve as shared practices to draw upon when we do the one thing that affects everything else we do: communicate.
			
			### **We use Calls as the last resort, not the first option.**
			
			We only do calls when it’s absolutely inevitable. Five people in a call for an hour isn't a one hour call, it's a five hour call. Be mindful of the tradeoffs (such as having less time to get things done.)
			
			### We use calls for collaboration, not for presentation.
			
			Calls are for the exchange of ideas, asking/answering questions, and working on solving a problem together. Anything that is for transferring information should not be a call, for those cases, we use slack or record a video.
			
			### We are not spectators (unless we are asked to be)
			
			We expect everyone to participate in calls, bringing up questions, proposing ideas, etc. If you don’t have anything to contribute, then you should not be in that meeting. Being distracted, chatting on slack, or plain “zombie mode” is disrespectful and not acceptable.
			
			### We spread knowledge for everyone
			
			Every call MUST have a summary/meeting notes. Calls only help who’s in the call, writing helps everyone. This includes people who couldn't make it, or future employees who join years from now. Meeting notes also help participants to be aligned on what was discussed and agreed.
			
			### We talk publicly, so everyone can benefit from
			
			We value the common knowledge that comes from talking on public channels. We don’t use private channels (unless it is a personal matter), we actually hate private chats that if we receive one we move to the right channel.
			
			### If we are blocked, we ask and meanwhile we keep going
			
			When we are stuck with something we need help, we ask on the respective team channel (#design #webflow #development) and keep going with something else. Never expect or require someone to get back to you immediately unless it’s a true emergency."
			}
		]
		`
		const outputFormat = `Return the answer as a JSON object like this: 
		'{
			"answer": {your answer}
			"article": {Article's id}
		}'`
		tokenCount += getTokens(prompt)
		if (tokenCount >= 4000) {
			throw new Error('Query too large') // explore better ways to handle
		}

		const messages: ChatCompletionRequestMessage[] = [
			{ role: 'system', content: prompt },
			{ role: 'assistant', content: assistant },
			{ role: 'user', content: outputFormat },
			...reqMessages
		]

		const chatRequestOptions: CreateChatCompletionRequest = {
			model: 'gpt-3.5-turbo',
			messages: messages,
			temperature: 0.9,
			stream: false
		}
		const chatResponse = await fetch(`${OPENAI_URL}/chat/completions`, {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENAI_KEY}`
			},
			method: 'POST',
			body: JSON.stringify(chatRequestOptions)
		})

		if (!chatResponse.ok) {
			const err = await chatResponse.json()
			throw new Error('chatResponse not ok: ' + err)
		}

		const answer = JSON.parse(await chatResponse.text())
		const answerObj = JSON.parse(answer.choices[0].message.content)
		const elevenRequestOptions = {
			text: answerObj.answer,

			voice_settings: {
				stability: 0,
				similarity_boost: 0
			}
		}

		const elevenResponse = await fetch(`${ELEVENLABS_URL}/text-to-speech/${ELEVENLABS_VOICE}`, {
			headers: {
				'Content-Type': 'application/json',
				'xi-api-key': `${ELEVENLABS_KEY}`
			},
			method: 'POST',
			body: JSON.stringify(elevenRequestOptions)
		})

		if (!elevenResponse.ok) {
			const err = await elevenResponse.json()
			console.log(err)
			throw new Error('elevenResponse not ok: ', err)
		}
		const audioBlob = await elevenResponse.blob()

		answerObj.audio = `data:audio/mpeg;base64,${await audioBlob.text()}`
		return new Response(JSON.stringify(answerObj), {
			headers: { 'Content-Type': 'application/json' }
		})
		/*return new Response(, {
			headers: {
				'Content-Type': 'audio/mpeg'
			}
		})*/
	} catch (err) {
		console.log(err)
		return json(
			{ error: 'There was an error processing your request. Try again.' },
			{ status: 500 }
		)
	}
}
