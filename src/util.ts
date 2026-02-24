import { KJUR } from 'jsrsasign'
import dotenv from 'dotenv'
dotenv.config()

const ZOOM_API_KEY = process.env.ZOOM_API_KEY
const ZOOM_API_SECRET = process.env.ZOOM_API_SECRET

if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    throw new Error('ZOOM_API_KEY and ZOOM_API_SECRET are required')
}

const generateJWT = () => {
    const now = Math.round(Date.now() / 1000)
    const iat = now - 30
    const exp = iat + 60 * 60 * 2
    const oHeader = { alg: 'HS256', typ: 'JWT' }
    const oPayload = {
        iss: ZOOM_API_KEY,
        iat: iat,
        exp: exp
    }
    const sHeader = JSON.stringify(oHeader)
    const sPayload = JSON.stringify(oPayload)
    const API_JWT = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, ZOOM_API_SECRET)
    return API_JWT
}

export { generateJWT }
